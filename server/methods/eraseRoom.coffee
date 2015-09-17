Meteor.methods
	eraseRoom: (rid) ->
		fromId = Meteor.userId()

		roomType = RocketChat.models.Rooms.findOneById(rid)?.t

		if RocketChat.authz.hasPermission( fromId, "delete-#{roomType}", rid )
			# console.log '[methods] eraseRoom -> '.green, 'fromId:', fromId, 'rid:', rid

			# ChatRoom.update({ _id: rid}, {'$pull': { userWatching: Meteor.userId(), userIn: Meteor.userId() }})

			ChatMessage.remove({rid: rid})
			RocketChat.models.Subscriptions.removeByRoomId rid
			ChatRoom.remove(rid)
			# @TODO remove das mensagens lidas do usuário
		else
			throw new Meteor.Error 'unauthorized'
