/* globals popover, isRtl */
const commonHelpers = {
	title() {
		return t(this.i18nTitle) || this.title;
	},
	active() {
		if (this.template === Template.instance().tabBar.getTemplate() && Template.instance().tabBar.getState() === 'opened') {
			return 'active';
		}
	},
	buttons() {
		return RocketChat.TabBar.getButtons().filter(button => {
			if (!Meteor.userId() && !this.anonymous) {
				return false;
			}
			if (button.groups.indexOf(Template.instance().tabBar.currentGroup()) === -1) {
				return false;
			}
			return true;
		});
	}
};

Template.flexTabBar.helpers({
	...commonHelpers,
	opened() {
		return Template.instance().tabBar.getState();
	},

	template() {
		return Template.instance().tabBar.getTemplate();
	},

	flexData() {
		return Object.assign(Template.currentData().data || {}, {
			tabBar: Template.instance().tabBar
		});
	},

	embeddedVersion() {
		return RocketChat.Layout.isEmbedded();
	}
});

const commonEvents = {
	'click .js-action'(e, instance) {
		$('button', e.currentTarget).blur();
		e.preventDefault();
		const $flexTab = $('.flex-tab-container .flex-tab');

		if (instance.tabBar.getState() === 'opened' && instance.tabBar.getTemplate() === this.template) {
			$flexTab.attr('template', '');
			return instance.tabBar.close();
		}

		$flexTab.attr('template', this.template);
		instance.tabBar.setData({
			label: this.i18nTitle,
			icon: this.icon
		});
		instance.tabBar.open(this);

		popover.close();
	}
};

Template.flexTabBar.events({
	'click .tab-button'(e, instance) {
		e.preventDefault();
		const $flexTab = $('.flex-tab-container .flex-tab');

		if (instance.tabBar.getState() === 'opened' && instance.tabBar.getTemplate() === this.template) {
			$flexTab.attr('template', '');
			return instance.tabBar.close();
		}

		$flexTab.attr('template', this.template);

		instance.tabBar.open(this);
	},

	'click .close-flex-tab'(event, instance) {
		instance.tabBar.close();
	}
});

Template.flexTabBar.onCreated(function() {
	this.tabBar = Template.currentData().tabBar;
});

Template.RoomsActionMore.events({
	...commonEvents
});


Template.RoomsActionMore.helpers({
	...commonHelpers
});

Template.RoomsActionMore.onCreated(function() {
	this.tabBar = Template.currentData().tabBar;
});

Template.RoomsActionTab.events({
	...commonEvents,
	'click .js-more'(e, instance) {
		$(e.currentTarget).blur();
		e.preventDefault();
		const groups = RocketChat.messageBox.actions.get();
		const buttons = RocketChat.TabBar.getButtons().filter(button => {
			if (!Meteor.userId() && !this.anonymous) {
				return false;
			}
			if (button.groups.indexOf(Template.instance().tabBar.currentGroup()) === -1) {
				return false;
			}
			return true;
		});

		const config = {
			template: 'RoomsActionMore',
			popoverClass: 'message-box',
			columns: [
				{
					groups: Object.keys(groups).map(group => {
						const items = [];
						groups[group].forEach(item => {
							items.push({
								icon: item.icon,
								name: t(item.label),
								type: 'messagebox-action',
								id: item.id
							});
						});
						return {
							title: t(group),
							items
						};
					})
				}
			],
			mousePosition: () => ({
				x: e.currentTarget.getBoundingClientRect().right + 10,
				y: e.currentTarget.getBoundingClientRect().bottom + 100
			}),
			customCSSProperties: () => ({
				top:  `${ e.currentTarget.getBoundingClientRect().bottom + 10 }px`,
				left: isRtl() ? `${ e.currentTarget.getBoundingClientRect().left - 10 }px` : undefined
			}),
			data: {
				rid: this._id,
				buttons: instance.small.get() ? buttons : buttons.slice(4),
				tabBar: instance.tabBar
			},
			activeElement: e.currentTarget
		};

		popover.open(config);
	}
});

Template.RoomsActionTab.onDestroyed(function() {
	$(window).off('resize', this.refresh);
});
Template.RoomsActionTab.onCreated(function() {
	this.small = new ReactiveVar(window.matchMedia('(max-width: 500px)').matches);
	this.refresh = _.throttle(() => {
		this.small.set(window.matchMedia('(max-width: 500px)').matches);
	}, 100);
	$(window).on('resize', this.refresh);
	this.tabBar = Template.currentData().tabBar;
});

Template.RoomsActionTab.helpers({
	...commonHelpers,
	active() {
		if (this.template === Template.instance().tabBar.getTemplate() && Template.instance().tabBar.getState() === 'opened') {
			return 'active';
		}
	},

	buttons() {
		if (Template.instance().small.get()) {
			return [];
		}
		const buttons = RocketChat.TabBar.getButtons().filter(button => {
			if (!Meteor.userId() && !this.anonymous) {
				return false;
			}
			if (button.groups.indexOf(Template.instance().tabBar.currentGroup()) === -1) {
				return false;
			}
			return true;
		});
		return buttons.length <= 5 ? buttons : buttons.slice(0, 4);
	},

	moreButtons() {
		if (Template.instance().small.get()) {
			return true;
		}
		const buttons = RocketChat.TabBar.getButtons().filter(button => {
			if (!Meteor.userId() && !this.anonymous) {
				return false;
			}
			if (button.groups.indexOf(Template.instance().tabBar.currentGroup()) === -1) {
				return false;
			}
			return true;
		});
		return buttons.length > 5 ? true : false;
	}
});
