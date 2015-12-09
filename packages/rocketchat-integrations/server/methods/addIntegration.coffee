Meteor.methods
	addIntegration: (integration) ->
		if not RocketChat.authz.hasPermission @userId, 'manage-integrations'
			throw new Meteor.Error 'not_authorized'

		if not _.isString(integration.channel)
			throw new Meteor.Error 'invalid_channel', '[methods] addIntegration -> channel must be string'

		if integration.channel.trim() is ''
			throw new Meteor.Error 'invalid_channel', '[methods] addIntegration -> channel can\'t be empty'

		if integration.channel[0] not in ['@', '#']
			throw new Meteor.Error 'invalid_channel', '[methods] addIntegration -> channel should start with # or @'

		if not _.isString(integration.username)
			throw new Meteor.Error 'invalid_username', '[methods] addIntegration -> username must be string'

		if integration.username.trim() is ''
			throw new Meteor.Error 'invalid_username', '[methods] addIntegration -> username can\'t be empty'

		record = undefined
		channelType = integration.channel[0]
		channel = integration.channel.substr(1)

		switch channelType
			when '#'
				record = RocketChat.models.Rooms.findOne
					$or: [
						{_id: channel}
						{name: channel}
					]
			when '@'
				record = RocketChat.models.Users.findOne
					$or: [
						{_id: channel}
						{username: channel}
					]

		if record is undefined
			throw new Meteor.Error 'channel_does_not_exists', "[methods] addIntegration -> The channel does not exists"

		user = RocketChat.models.Users.findOne({username: integration.username})

		if not user?
			throw new Meteor.Error 'user_does_not_exists', "[methods] addIntegration -> The username does not exists"

		stampedToken = Accounts._generateStampedLoginToken()
		hashStampedToken = Accounts._hashStampedToken(stampedToken)

		updateObj =
			$push:
				'services.resume.loginTokens':
					hashedToken: hashStampedToken.hashedToken
					integration: true

		integration.token = hashStampedToken.hashedToken
		integration.userId = user._id

		RocketChat.models.Users.update {_id: user._id}, updateObj

		integration._id = RocketChat.models.Integrations.insert integration

		return integration
