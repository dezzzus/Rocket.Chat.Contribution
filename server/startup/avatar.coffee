Meteor.startup ->
	storeType = 'GridFS'

	if RocketChat.settings.get 'Accounts_AvatarStoreType'
		storeType = RocketChat.settings.get 'Accounts_AvatarStoreType'

	RocketChatStore = RocketChatFile[storeType]

	if not RocketChatStore?
		throw new Error "Invalid RocketChatStore type [#{storeType}]"

	console.log "Using #{storeType} for Avatar storage".green

	transformWrite = undefined
	if RocketChat.settings.get('Accounts_AvatarResize') is true
		height = RocketChat.settings.get 'Accounts_AvatarSize'
		width = height
		transformWrite = (file, readStream, writeStream) ->
			RocketChatFile.gm(readStream, file.fileName).background('#ffffff').resize(width, height+'^>').gravity('Center').extent(width, height).stream('jpeg').pipe(writeStream)

	path = "~/uploads"

	if RocketChat.settings.get('Accounts_AvatarStorePath')?.trim() isnt ''
		path = RocketChat.settings.get 'Accounts_AvatarStorePath'

	@RocketChatFileAvatarInstance = new RocketChatStore
		name: 'avatars'
		absolutePath: path
		transformWrite: transformWrite

	WebApp.connectHandlers.use '/avatar/', (req, res, next) ->
		params =
			username: decodeURIComponent(req.url.replace(/^\//, '').replace(/\?.*$/, ''))

		if params.username[0] isnt '@'
			file = RocketChatFileAvatarInstance.getFileWithReadStream params.username
		else
			params.username = params.username.replace '@', ''

		#console.log "[avatar] checking username #{@params.username} (derrived from path #{req.url})"
		res.setHeader 'Content-Disposition', 'inline'

		if not file?
			res.setHeader 'content-type', 'image/svg+xml'
			res.setHeader 'cache-control', 'public'
			res.setHeader 'Last-Modified', "Thu, 01 Jan 2015 00:00:00 GMT"

			reqModifiedHeader = req.headers["if-modified-since"];
			if reqModifiedHeader?
				if reqModifiedHeader is "Thu, 01 Jan 2015 00:00:00 GMT"
					res.writeHead 304
					res.end()
					return

			colors = ['#F44336','#E91E63','#9C27B0','#673AB7','#3F51B5','#2196F3','#03A9F4','#00BCD4','#009688','#4CAF50','#8BC34A','#CDDC39','#FFC107','#FF9800','#FF5722','#795548','#9E9E9E','#607D8B']

			username = params.username.replace('.jpg', '')
			color = ''
			initials = ''
			if username is "?"
				color = "#000"
				initials = username
			else
				position = username.length % colors.length
				color = colors[position]
				username = username.replace(/[^A-Za-z0-9]/g, '.').replace(/\.+/g, '.').replace(/(^\.)|(\.$)/g, '')
				usernameParts = username.split('.')
				initials = if usernameParts.length > 1
					_.first(usernameParts)[0] + _.last(usernameParts)[0]
				else
					username.replace(/[^A-Za-z0-9]/g, '').substr(0, 2)
				initials = initials.toUpperCase()

			svg = """
			<?xml version="1.0" encoding="UTF-8" standalone="no"?>
			<svg xmlns="http://www.w3.org/2000/svg" pointer-events="none" width="50" height="50" style="width: 50px; height: 50px; background-color: #{color};">
				<text text-anchor="middle" y="50%" x="50%" dy="0.36em" pointer-events="auto" fill="#ffffff" font-family="Helvetica, Arial, Lucida Grande, sans-serif" style="font-weight: 400; font-size: 28px;">
					#{initials}
				</text>
			</svg>
			"""

			res.write svg
			res.end()
			return

		reqModifiedHeader = req.headers["if-modified-since"];
		if reqModifiedHeader?
			if reqModifiedHeader == file.uploadDate?.toUTCString()
				res.setHeader 'Last-Modified', reqModifiedHeader
				res.writeHead 304
				res.end()
				return

		res.setHeader 'Last-Modified', file.uploadDate?.toUTCString() or new Date().toUTCString()
		res.setHeader 'content-type', 'image/jpeg'
		res.setHeader 'Content-Length', file.length

		file.readStream.pipe res
		return
