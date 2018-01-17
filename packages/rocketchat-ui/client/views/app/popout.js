/* globals popout */

this.popout = {
	context: null,
	isAudioOnly: false,
	x: 0,
	y: 0,
	open(config = {}, fn) {
		this.close();
		this.context = Blaze.renderWithData(Template.popout, config, document.body);
		this.fn = fn;
		this.config = config;
		this.onCloseCallback = config.onCloseCallback || null;
		this.timer = null;
		if (config.timer) {
			this.timer = setTimeout(() => this.close(), config.timer);
		}
		if (config.isAudioOnly) {
			this.isAudioOnly = config.isAudioOnly;
		}
	},
	close() {
		if (this.context) {
			Blaze.remove(this.context);
		}
		this.context = null;
		this.fn = null;
		if (this.timer) {
			clearTimeout(this.timer);
		}
		if (typeof(this.onCloseCallback) === 'function') {
			this.onCloseCallback();
		}
	},
	dragover(event) {
		const e = event.originalEvent || event;
		e.dataTransfer.dropEffect = 'move';
		e.preventDefault();
	},
	drop(event) {
		const e = event.originalEvent || event;
		e.preventDefault();
		// do not mess with the position if we are dropping files in the dropzone
		if (!event.target.classList.contains('dropzone-overlay')) {
			const popoutElement = document.querySelector('.rc-popout-wrapper');
			const positionTop = e.clientY - popout.y;
			const positionLeft = e.clientX - popout.x;
			popoutElement.style.left = `${ positionLeft >= 0 ? positionLeft : 0 }px`;
			popoutElement.style.top = `${ positionTop >= 0 ? positionTop : 0 }px`;
		}
	}
};

Template.popout.helpers({
	state() {
		return Template.instance().isMinimized.get() ? 'closed' : 'open';
	},
	type() {
		return 'video'; //or 	'audio'
	},
	isMuted() {
		return Template.instance().isMuted.get();
	},
	isPlaying() {
		return Template.instance().isPlaying.get();
	}
});

Template.popout.onRendered(function() {
	if (this.data.onRendered) {
		this.data.onRendered();
	}
});
Template.popout.onCreated(function() {
	this.isMinimized = new ReactiveVar(false);
	this.isAudioOnly = new ReactiveVar(popout.isAudioOnly);
	this.isMuted = new ReactiveVar(false);
	this.isPlaying = new ReactiveVar(true);


	document.body.addEventListener('dragover', popout.dragover, true);
	document.body.addEventListener('drop', popout.drop, true);
});

Template.popout.onDestroyed(function() {
	popout.context = null;
	document.body.removeEventListener('dragover', popout.dragover, true);
	document.body.removeEventListener('drop', popout.drop, true);

});

Template.popout.events({
	'click .js-action'(e, instance) {
		!this.action || this.action.call(instance.data.data, e, instance);
		e.stopPropagation();
		popout.close();
	},
	'click .js-close'(e) {
		e.stopPropagation();
		popout.close();
	},
	'click .js-minimize'(e, i) {
		e.stopPropagation();
		if (i.isMinimized.get()) {
			i.isMinimized.set(false);
			window.liveStreamPlayer.setSize(380, 214);
		} else {
			i.isMinimized.set(true);
			window.liveStreamPlayer.setSize(0, 0);
		}
	},
	'dragstart .rc-popout-wrapper'(event) {
		const e = event.originalEvent || event;
		const url = this.data.streamingSource || '.rc-popout-wrapper';
		popout.x = e.offsetX;
		popout.y = e.offsetY;
		e.dataTransfer.setData('application/x-moz-node', e.currentTarget);
		e.dataTransfer.setData('text/plain', url);
		e.dataTransfer.effectAllowed = 'move';
	},
	'dragend .rc-popout-wrapper'(event) {
		event.preventDefault();
	},
	'click .rc-popout__controls--play'(e, i) {
		window.liveStreamPlayer.playVideo();
		i.isPlaying.set(true);
	},
	'click .rc-popout__controls--pause'(e, i) {
		window.liveStreamPlayer.pauseVideo();
		i.isPlaying.set(false);
	},
	'click .rc-popout__controls--mute'(e, i) {
		window.liveStreamPlayer.mute();
		i.isMuted.set(true);
	},
	'click .rc-popout__controls--unmute'(e, i) {
		window.liveStreamPlayer.unMute();
		i.isMuted.set(false);
	}
});

RocketChat.callbacks.add('afterLogoutCleanUp', () => popout.close(), RocketChat.callbacks.priority.MEDIUM, 'popout-close-after-logout-cleanup');
