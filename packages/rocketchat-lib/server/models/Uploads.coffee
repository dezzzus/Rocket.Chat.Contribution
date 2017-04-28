RocketChat.models.Uploads = new class extends RocketChat.models._Base
	constructor: ->
		super('uploads')

		@tryEnsureIndex { 'rid': 1 }
		@tryEnsureIndex { 'uploadedAt': 1 }

	findNotHiddenFilesOfRoom: (roomId, limit) ->
		fileQuery =
			rid: roomId
			complete: true
			uploading: false
			_hidden:
				$ne: true

		fileOptions =
			limit: limit
			sort:
				uploadedAt: -1
			fields:
				_id: 1
				userId: 1
				rid: 1
				name: 1
				description: 1
				type: 1
				url: 1
				uploadedAt: 1

		return @find fileQuery, fileOptions

	insertFileInit: (userId, store, file, extra) ->
		fileData =
			userId: userId
			store: store
			complete: false
			uploading: true
			progress: 0
			extension: s.strRightBack(file.name, '.')
			uploadedAt: new Date()

		_.extend(fileData, file, extra);

		if @model.direct?.insert?
			file = @model.direct.insert fileData
		else
			file = @insert fileData

		return file

	insertAvatarFileInit: (name, userId, store, file, extra) ->
		fileData =
			name: "#{name}.avatar"
			userId: userId
			store: store
			complete: false
			uploading: true
			progress: 0
			extension: s.strRightBack(file.name, '.')
			uploadedAt: new Date()

		_.extend(fileData, file, extra);

		file = @insertOrUpsert fileData

		return file

	updateFileComplete: (fileId, userId, file) ->
		if not fileId
			return

		filter =
			_id: fileId
			userId: userId

		update =
			$set:
				complete: true
				uploading: false
				progress: 1

		update.$set = _.extend file, update.$set

		if @model.direct?.update?
			result = @model.direct.update filter, update
		else
			result = @update filter, update

		return result

	# @TODO deprecated
	updateFileCompleteByNameAndUserId: (name, userId, url) ->
		if not name
			return

		filter =
			name: name
			userId: userId

		update =
			$set:
				complete: true
				uploading: false
				progress: 1
				url: url

		if @model.direct?.update?
			result = @model.direct.update filter, update
		else
			result = @update filter, update

		return result

	findOneByName: (name) ->
		return @findOne name: name

	deleteFile: (fileId) ->
		if @model.direct?.remove?
			return @model.direct.remove { _id: fileId }
		else
			return @remove { _id: fileId }

	updateFileNameById: (fileId, name) ->
		filter = _id: fileId
		update = $set: name: name
		if @model.direct?.update?
			return @model.direct.update filter, update
		else
			return @update filter, update
