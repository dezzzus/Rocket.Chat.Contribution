/* global Restivus, Auth */
import _ from 'underscore';

class API extends Restivus {
	constructor(properties) {
		super(properties);
		this.logger = new Logger(`API ${ properties.version ? properties.version : 'default' } Logger`, {});
		this.authMethods = [];
		this.helperMethods = new Map();
		this.fieldSeparator = '.';
		this.defaultFieldsToExclude = {
			joinCode: 0,
			$loki: 0,
			meta: 0,
			members: 0,
			importIds: 0
		};
		this.limitedUserFieldsToExclude = {
			avatarOrigin: 0,
			emails: 0,
			phone: 0,
			statusConnection: 0,
			createdAt: 0,
			lastLogin: 0,
			services: 0,
			requirePasswordChange: 0,
			requirePasswordChangeReason: 0,
			roles: 0,
			statusDefault: 0,
			_updatedAt: 0,
			customFields: 0
		};

		this._config.defaultOptionsEndpoint = function() {
			if (this.request.method === 'OPTIONS' && this.request.headers['access-control-request-method']) {
				if (RocketChat.settings.get('API_Enable_CORS') === true) {
					this.response.writeHead(200, {
						'Access-Control-Allow-Origin': RocketChat.settings.get('API_CORS_Origin'),
						'Access-Control-Allow-Headers': 'Origin, X-Requested-With, Content-Type, Accept, X-User-Id, X-Auth-Token'
					});
				} else {
					this.response.writeHead(405);
					this.response.write('CORS not enabled. Go to "Admin > General > REST Api" to enable it.');
				}
			} else {
				this.response.writeHead(404);
			}

			this.done();
		};
	}

	addAuthMethod(method) {
		this.authMethods.push(method);
	}

	success(result={}) {
		if (_.isObject(result)) {
			result.success = true;
		}

		return {
			statusCode: 200,
			body: result
		};
	}

	failure(result, errorType) {
		if (_.isObject(result)) {
			result.success = false;
		} else {
			result = {
				success: false,
				error: result
			};

			if (errorType) {
				result.errorType = errorType;
			}
		}

		return {
			statusCode: 400,
			body: result
		};
	}


	unauthorized(msg) {
		return {
			statusCode: 403,
			body: {
				success: false,
				error: msg ? msg : 'unauthorized'
			}
		};
	}

	addRoute(routes, options, endpoints) {
		//Note: required if the developer didn't provide options
		if (typeof endpoints === 'undefined') {
			endpoints = options;
			options = {};
		}

		//Allow for more than one route using the same option and endpoints
		if (!_.isArray(routes)) {
			routes = [routes];
		}

		routes.forEach((route) => {
			//Note: This is required due to Restivus calling `addRoute` in the constructor of itself
			if (this.helperMethods) {
				Object.keys(endpoints).forEach((method) => {
					if (typeof endpoints[method] === 'function') {
						endpoints[method] = { action: endpoints[method] };
					}

					//Add a try/catch for each endpoint
					const originalAction = endpoints[method].action;
					endpoints[method].action = function() {
						this.logger.debug(`${ this.request.method.toUpperCase() }: ${ this.request.url }`);
						let result;
						try {
							result = originalAction.apply(this);
						} catch (e) {
							this.logger.debug(`${ method } ${ route } threw an error:`, e.stack);
							return RocketChat.API.v1.failure(e.message, e.error);
						}

						return result ? result : RocketChat.API.v1.success();
					};

					for (const [name, helperMethod] of this.helperMethods) {
						endpoints[method][name] = helperMethod;
					}

					//Allow the endpoints to make usage of the logger which respects the user's settings
					endpoints[method].logger = this.logger;
				});
			}

			super.addRoute(route, options, endpoints);
		});
	}

	_initAuth() {
		const self = this;
		/*
		Add a login endpoint to the API
		After the user is logged in, the onLoggedIn hook is called (see Restfully.configure() for
		adding hook).
		*/
		this.addRoute('login', {authRequired: false}, {
			post() {
				// Grab the username or email that the user is logging in with
				const user = {};
				if (this.bodyParams.user) {
					if (this.bodyParams.user.indexOf('@') === -1) {
						user.username = this.bodyParams.user;
					} else {
						user.email = this.bodyParams.user;
					}
				} else if (this.bodyParams.username) {
					user.username = this.bodyParams.username;
				} else if (this.bodyParams.email) {
					user.email = this.bodyParams.email;
				}

				let password = this.bodyParams.password;
				if (this.bodyParams.hashed) {
					password = {
						digest: password,
						algorithm: 'sha-256'
					};
				}

				let auth;
				try {
					// Try to log the user into the user's account (if successful we'll get an auth token back)
					auth = Auth.loginWithPassword(user, password);
				} catch (error) {
					const e = error;
					return {
						statusCode: e.error,
						body: {
							status: 'error',
							message: e.reason
						}
					};
				}
				// Get the authenticated user
				// TODO: Consider returning the user in Auth.loginWithPassword(), instead of fetching it again here
				if (auth.userId && auth.authToken) {
					const searchQuery = {};
					searchQuery[self._config.auth.token] = Accounts._hashLoginToken(auth.authToken);

					this.user = Meteor.users.findOne({
						'_id': auth.userId
					}, searchQuery);

					this.userId = this.user && this.user._id;
				}

				// Start changes
				const attempt = {
					allowed: true,
					user: this.user,
					methodArguments: [{
						user,
						password
					}],
					type: 'password'
				};

				if (this.bodyParams.code) {
					attempt.methodArguments[0] = {
						totp: {
							code: this.bodyParams.code,
							...attempt.methodArguments[0]
						}
					};
				}

				Accounts._validateLogin(null, attempt);

				if (attempt.allowed !== true) {
					const error = attempt.error || new Meteor.Error('invalid-login-attempt', 'Invalid Login Attempt');

					return {
						statusCode: 401,
						body: {
							status: 'error',
							error: error.error,
							reason: error.reason,
							message: error.message
						}
					};
				}
				// End changes

				const response = {
					status: 'success',
					data: auth
				};

				// Call the login hook with the authenticated user attached
				const extraData = self._config.onLoggedIn && self._config.onLoggedIn.call(this);

				if (extraData != null) {
					_.extend(response.data, {
						extra: extraData
					});
				}

				return response;
			}
		});

		const logout = function() {
			// Remove the given auth token from the user's account
			const authToken = this.request.headers['x-auth-token'];
			const hashedToken = Accounts._hashLoginToken(authToken);
			const tokenLocation = self._config.auth.token;
			const index = tokenLocation.lastIndexOf('.');
			const tokenPath = tokenLocation.substring(0, index);
			const tokenFieldName = tokenLocation.substring(index + 1);
			const tokenToRemove = {};
			tokenToRemove[tokenFieldName] = hashedToken;
			const tokenRemovalQuery = {};
			tokenRemovalQuery[tokenPath] = tokenToRemove;

			Meteor.users.update(this.user._id, {
				$pull: tokenRemovalQuery
			});

			const response = {
				status: 'success',
				data: {
					message: 'You\'ve been logged out!'
				}
			};

			// Call the logout hook with the authenticated user attached
			const extraData = self._config.onLoggedOut && self._config.onLoggedOut.call(this);
			if (extraData != null) {
				_.extend(response.data, {
					extra: extraData
				});
			}
			return response;
		};

		/*
		Add a logout endpoint to the API
		After the user is logged out, the onLoggedOut hook is called (see Restfully.configure() for
		adding hook).
		*/
		return this.addRoute('logout', {
			authRequired: true
		}, {
			get() {
				console.warn('Warning: Default logout via GET will be removed in Restivus v1.0. Use POST instead.');
				console.warn('    See https://github.com/kahmali/meteor-restivus/issues/100');
				return logout.call(this);
			},
			post: logout
		});
	}
}


RocketChat.API = {};

const getUserAuth = function _getUserAuth() {
	const invalidResults = [undefined, null, false];
	return {
		token: 'services.resume.loginTokens.hashedToken',
		user() {
			if (this.bodyParams && this.bodyParams.payload) {
				this.bodyParams = JSON.parse(this.bodyParams.payload);
			}

			for (let i = 0; i < RocketChat.API.v1.authMethods.length; i++) {
				const method = RocketChat.API.v1.authMethods[i];

				if (typeof method === 'function') {
					const result = method.apply(this, arguments);
					if (!invalidResults.includes(result)) {
						return result;
					}
				}
			}

			let token;
			if (this.request.headers['x-auth-token']) {
				token = Accounts._hashLoginToken(this.request.headers['x-auth-token']);
			}

			return {
				userId: this.request.headers['x-user-id'],
				token
			};
		}
	};
};

RocketChat.API.v1 = new API({
	version: 'v1',
	useDefaultAuth: true,
	prettyJson: true,
	enableCors: false,
	auth: getUserAuth()
});

RocketChat.API.default = new API({
	useDefaultAuth: true,
	prettyJson: true,
	enableCors: false,
	auth: getUserAuth()
});
