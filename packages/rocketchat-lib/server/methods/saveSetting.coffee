Meteor.methods
	saveSetting: (_id, value) ->
		console.log '[method] saveSetting', _id, value
		if Meteor.userId()?
			user = Meteor.users.findOne Meteor.userId()

		unless RocketChat.authz.hasPermission(Meteor.userId(), 'edit-privileged-setting') is true
			throw new Meteor.Error 503, 'Not authorized'

		# console.log "saveSetting -> ".green, _id, value
		RocketChat.settings.updateById _id, value
		return true
