Template.contextualBar.events({
	'click .contextual-bar__header-close'(e, t) {
		t.tabBar.close();
	}
});

Template.contextualBar.onCreated(function() {
	this.tabBar = Template.currentData().tabBar;
});

Template.contextualBar.helpers({
	template() {
		return Template.instance().tabBar.getTemplate();
	},
	headerData() {
		return Template.instance().tabBar.getData();
	},
	flexData() {
		return Object.assign(Template.currentData().data || {}, {
			tabBar: Template.instance().tabBar
		});
	}
});
