const options = {
	fields: Object.keys({
		_id: 1,
		name: 1,
		t: 1,
		cl: 1,
		u: 1,
		// usernames: 1,
		topic: 1,
		muted: 1,
		archived: 1,
		jitsiTimeout: 1,
		description: 1
	})
};


const roomMap = (record) => {
	if (record._room) {
		return _.pick(record._room, ...options.fields);
	}
	console.log('Empty Room for Subscription', record);
	return {};
};


Meteor.methods({
	'rooms/get'(updatedAt) {
		if (!Meteor.userId()) {
			return [];
		}

		this.unblock();

		const data = RocketChat.cache.Subscriptions.findByUserId(Meteor.userId()).fetch();

		if (updatedAt instanceof Date) {
			return data
				.filter(record => { return record._room && record._room._updatedAt > updatedAt; })
				.map(roomMap);
		}

		return data.map(roomMap);
	}
});

RocketChat.cache.Rooms.on('sync', (type, room/*, diff*/) => {
	const records = RocketChat.cache.Subscriptions.findByIndex('rid', room._id);
	for (const record of records) {
		RocketChat.Notifications.notifyUser(record.u._id, 'rooms-changed', type, roomMap({_room: room}));
	}
});
