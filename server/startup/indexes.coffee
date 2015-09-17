Meteor.startup ->
	Meteor.defer ->
		try ChatMessage._ensureIndex { 'rid': 1, 'ts': 1 } catch e then console.log e
		try ChatMessage._ensureIndex { 'ets': 1 }, { sparse: 1 } catch e then console.log e
		try ChatMessage._ensureIndex { 'rid': 1, 't': 1, 'u._id': 1 } catch e then console.log e
		try ChatMessage._ensureIndex { 'expireAt': 1 }, { expireAfterSeconds: 0 } catch e then console.log e
		try ChatMessage._ensureIndex { 'msg': 'text' } catch e then console.log e
