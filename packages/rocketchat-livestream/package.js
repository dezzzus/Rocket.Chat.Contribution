Package.describe({
	name: 'rocketchat:livestream',
	version: '0.0.2',
	summary: 'Embed livestream to Rocket.Chat channels',
	git: ''
});

Package.onUse(function(api) {
	api.use('templating', 'client');
	api.use([
		'ecmascript',
		'rocketchat:lib'
	]);
	api.addFiles([
		'client/views/liveStreamTab.html',
		'client/views/liveStreamTab.js',
		'client/views/liveStreamView.html',
		'client/views/liveStreamView.js',
		'client/tabBar.js'
	], 'client');

	api.addFiles([
		'server/models/Rooms.js',
		'server/functions/saveStreamingOptions.js',
		'server/settings.js'
	], 'server');
});
