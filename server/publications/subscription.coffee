fields =
	t: 1
	ts: 1
	ls: 1
	name: 1
	rid: 1
	code: 1
	f: 1
	u: 1
	open: 1
	alert: 1
	roles: 1
	unread: 1
	archived: 1
	desktopNotifications: 1
	mobilePushNotifications: 1
	emailNotifications: 1


Meteor.methods
	subscriptions: ->
		unless Meteor.userId()
			return []

		this.unblock()

		options =
			fields: fields

		return RocketChat.models.Subscriptions.findByUserId(Meteor.userId(), options).fetch()


RocketChat.models.Subscriptions.on 'change', (type, args...) ->
	if type is 'update' and args[0]?.alert?.$ne?
		delete args[0].alert

	records = RocketChat.models.Subscriptions.getChangedRecords type, args[0], fields

	for record in records
		RocketChat.Notifications.notifyUser record.u._id, 'subscription-change', type, record
