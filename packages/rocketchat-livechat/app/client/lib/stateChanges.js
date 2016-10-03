/* globals state */

this.state = {
	update: function(room) {
		let id = room._id;
		let state = room.state;
    	if (id === visitor.getRoom() && typeof(state) === 'string') {
    		if (state !== visitor.getRoomState()) {
    			visitor.setRoomState(state);
    			this[state]();
    		}
    	}
	},

	//called when the state is set to connecting
	connecting: function() {
		console.log('connecting callback');
	},

	// called when the state is set to connected
	connected: function() {
		console.log('connected callback');
	},

	// called when the state is set to closed
	closed: function() {
		if (Livechat.transcript) this.sendTranscript();
	},

	// prompt guest if they would like to have a transcript sent
	sendTranscript: function(callback) {
		let self = this;
		var email = Meteor.user().emails[0].address || '';
		swal({
			title: t('Chat Closed'),		
			text: Livechat.transcriptMessage,
			type: "input",
			inputValue: email,
			showCancelButton: true,
			cancelButtonText: t('no'),
			confirmButtonText: t('yes'),
			closeOnCancel: true,
			closeOnConfirm: false	
		}, (response) => {
			if ((typeof response === 'boolean') && !response) {
				self.cleanup();
				return true;
			} else {
				if (!response) {
					swal.showInputError(t('please enter your email'));
					return false;
				} else if (response.trim() === '') {
					swal.showInputError(t('please enter your email'));
					return false;
				} else {
					Meteor.call('livechat:sendTranscript', visitor.getRoom(), response, (err, result) => {
						if (err) console.error(err);	
						swal({
							title: t('transcript sent successfully'),
							type: 'success',
							timer: 1000,
							showConfirmButton: true,
							confirmButtonText: t('ok'),
						}, () => {
							self.cleanup();
						});				
					});
				}
			}	
		});
	},

	cleanup: function() {
		console.log('cleanup');
	}
};

/* exported state */