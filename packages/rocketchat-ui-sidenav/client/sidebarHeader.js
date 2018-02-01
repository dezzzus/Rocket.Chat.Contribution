/* globals popover isRtl */

const setStatus = status => {
	AccountBox.setStatus(status);
	RocketChat.callbacks.run('userStatusManuallySet', status);
	popover.close();
};

const toolbarButtons = [
	{
		name: t('Search'),
		icon: 'magnifier'
	},
	{
		name: t('Browse_channels'),
		icon: 'globe'
	},
	{
		name: t('View_mode'),
		icon: 'th-list'
	},
	{
		name: t('Sort'),
		icon: 'sort',
		action: (e) => {
			const sidebarHeader = document.querySelector('.sidebar__header');
			const sidebarHeaderPadding = parseInt(getComputedStyle(sidebarHeader)['padding-left'].replace('px', '')) * 2;
			const sidebarHeaderMargin = parseInt(getComputedStyle(sidebarHeader)['margin-left'].replace('px', '')) * 2;
			const options = [];
			const config = {
				template: 'sortlist',
				mousePosition: () => ({
					x: e.currentTarget.getBoundingClientRect().left,
					y: e.currentTarget.getBoundingClientRect().bottom + 50
				}),
				customCSSProperties: () => ({
					top:  `${ e.currentTarget.getBoundingClientRect().bottom + 10 }px`,
					left: `${ e.currentTarget.getBoundingClientRect().left - 10 }px`
				}),
				data: {
					change : (value) => {
						// return instance.form[key].set(key === 'desktopNotificationDuration' ? parseInt(value) : value);
					},
					// value: instance.form[key].get(),
					options
				}
			};
			popover.open(config);
		}
	},
	{
		name: t('Create_A_New_Channel'),
		icon: 'plus',
		condition: () => !(Meteor.userId() == null && RocketChat.settings.get('Accounts_AllowAnonymousRead'))
	},
	{
		name: t('Options'),
		icon: 'menu',
		condition: () => !(Meteor.userId() == null && RocketChat.settings.get('Accounts_AllowAnonymousRead')),
		action: () => {
			let adminOption;
			if (RocketChat.authz.hasAtLeastOnePermission(['view-statistics', 'view-room-administration', 'view-user-administration', 'view-privileged-setting' ]) || (RocketChat.AdminBox.getOptions().length > 0)) {
				adminOption = {
					icon: 'customize',
					name: t('Administration'),
					type: 'open',
					id: 'administration',
					action: () => {
						SideNav.setFlex('adminFlex');
						SideNav.openFlex();
						FlowRouter.go('admin-info');
						popover.close();
					}
				};
			}

			const sidebarHeader = document.querySelector('.sidebar__header');
			const sidebarHeaderPadding = parseInt(getComputedStyle(sidebarHeader)['padding-left'].replace('px', '')) * 2;
			const sidebarHeaderMargin = parseInt(getComputedStyle(sidebarHeader)['margin-left'].replace('px', '')) * 2;

			const config = {
				popoverClass: 'sidebar-header',
				columns: [
					{
						groups: [
							{
								title: t('User'),
								items: [
									{
										icon: 'circle',
										name: t('Online'),
										modifier: 'online',
										action: () => setStatus('online')
									},
									{
										icon: 'circle',
										name: t('Away'),
										modifier: 'away',
										action: () => setStatus('away')
									},
									{
										icon: 'circle',
										name: t('Busy'),
										modifier: 'busy',
										action: () => setStatus('busy')
									},
									{
										icon: 'circle',
										name: t('Invisible'),
										modifier: 'offline',
										action: () => setStatus('offline')
									}
								]
							},
							{
								items: AccountBox.getItems().map(item => {
									let action;

									if (item.href) {
										action = () => {
											FlowRouter.go(item.href);
											popover.close();
										};
									}

									if (item.sideNav) {
										action = () => {
											SideNav.setFlex(item.sideNav);
											SideNav.openFlex();
											popover.close();
										};
									}

									return {
										icon: item.icon,
										name: t(item.name),
										type: 'open',
										id: item.name,
										href: item.href,
										sideNav: item.sideNav,
										action
									};
								}).concat([
									adminOption,
									{
										icon: 'user',
										name: t('My_Account'),
										type: 'open',
										id: 'account',
										action: () => {
											SideNav.setFlex('accountFlex');
											SideNav.openFlex();
											FlowRouter.go('account');
											popover.close();
										}
									},
									{
										icon: 'sign-out',
										name: t('Logout'),
										type: 'open',
										id: 'logout',
										action: () => {
											const user = Meteor.user();
											Meteor.logout(() => {
												RocketChat.callbacks.run('afterLogoutCleanUp', user);
												Meteor.call('logoutCleanUp', user);
												FlowRouter.go('home');
												popover.close();
											});
										}
									}
								])
							}
						]
					}
				],
				position: {
					top: sidebarHeader.offsetHeight
				},
				customCSSProperties: {
					width: `${ sidebarHeader.offsetWidth - sidebarHeaderPadding + sidebarHeaderMargin }px`,
					left: isRtl() ? 'auto' : getComputedStyle(sidebarHeader)['padding-left'],
					right: isRtl() ? getComputedStyle(sidebarHeader)['padding-left'] : 'auto'
				}
			};

			popover.open(config);
		}
	}];
Template.sidebarHeader.helpers({
	myUserInfo() {
		if (Meteor.user() == null && RocketChat.settings.get('Accounts_AllowAnonymousRead')) {
			return {
				username: 'anonymous',
				status: 'online'
			};
		}

		const user = Meteor.user() || {};
		const { username } = user;
		const userStatus = Session.get(`user_${ username }_status`);

		return {
			username,
			status: userStatus
		};
	},
	toolbarButtons() {
		return toolbarButtons.filter(button => !button.condition || button.condition());
	}
});

Template.sidebarHeader.events({
	'click .js-button'(e) {
		return this.action && this.action.apply(this, [e]);
	}
});
