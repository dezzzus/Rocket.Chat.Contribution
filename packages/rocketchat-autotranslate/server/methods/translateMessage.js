import { Meteor } from 'meteor/meteor';
import { RocketChat } from 'meteor/rocketchat:lib';

Meteor.methods({
	'autoTranslate.translateMessage'(message, targetLanguage) {
		const room = RocketChat.models.Rooms.findOneById(message && message.rid);
		if (message && room && RocketChat.AutoTranslate) {
			return RocketChat.AutoTranslate.translateMessage(message, room, targetLanguage);
		}
	},
});
