import { parseMessageText } from './index';

/**
 * Replaces @username with full name
 *
 * @param {string} message The message to replace
 * @param {object[]} mentions Array of mentions used to make replacements
 *
 * @returns {string}
 */
function replaceMentionedUsernamesWithFullNames(message, mentions) {
	if (!mentions || !mentions.length) {
		return message;
	}
	mentions.forEach((mention) => {
		const user = RocketChat.models.Users.findOneById(mention._id);
		if (user && user.name) {
			message = message.replace(`@${ mention.username }`, user.name);
		}
	});
	return message;
}

/**
 * Send notification to user
 *
 * @param {string} userId The user to notify
 * @param {object} user The sender
 * @param {object} room The room send from
 * @param {number} duration Duration of notification
 */
export function notifyDesktopUser(userId, user, message, room, duration) {

	const UI_Use_Real_Name = RocketChat.settings.get('UI_Use_Real_Name') === true;
	message.msg = parseMessageText(message, userId);

	if (UI_Use_Real_Name) {
		message.msg = replaceMentionedUsernamesWithFullNames(message.msg, message.mentions);
	}

	let title = '';
	let text = '';
	if (room.t === 'd') {
		title = UI_Use_Real_Name ? user.name : `@${ user.username }`;
		text = message.msg;
	} else if (room.name) {
		title = `#${ room.name }`;
		text = `${ UI_Use_Real_Name ? user.name : user.username }: ${ message.msg }`;
	} else {
		return;
	}

	RocketChat.Notifications.notifyUser(userId, 'notification', {
		title,
		text,
		duration,
		payload: {
			_id: message._id,
			rid: message.rid,
			sender: message.u,
			type: room.t,
			name: room.name
		}
	});
}

export function shouldNotifyDesktop({
	disableAllMessageNotifications,
	status,
	desktopNotifications,
	hasMentionToAll,
	hasMentionToHere,
	isHighlighted,
	hasMentionToUser
}) {
	if (disableAllMessageNotifications && desktopNotifications == null) {
		return false;
	}

	if (status === 'busy' || desktopNotifications === 'nothing') {
		return false;
	}

	if (!desktopNotifications) {
		if (RocketChat.settings.get('Accounts_Default_User_Preferences_desktopNotifications') === 'all') {
			return true;
		}
		if (RocketChat.settings.get('Accounts_Default_User_Preferences_desktopNotifications') === 'nothing') {
			return false;
		}
	}

	return (!disableAllMessageNotifications && (hasMentionToAll || hasMentionToHere)) || isHighlighted || desktopNotifications === 'all' || hasMentionToUser;
}
