Template.userSettings.helpers
	flexOpened: ->
		return 'opened' if Session.equals('flexOpened', true)
	arrowPosition: ->
		console.log 'room.helpers arrowPosition' if window.rocketDebug
		return 'left' unless Session.equals('flexOpened', true)

Template.userSettings.onRendered ->
	Tracker.afterFlush ->
		SideNav.setFlex "userSettingsFlex"
		SideNav.openFlex()

Template.userSettings.events
	'click .submit button': ->
		console.log 'submit button clicked'
		instance = Template.instance()

		if instance.child?.length > 0
			for child in instance.child
				child.save?()