/*
 * Markdown is a named function that will parse markdown syntax
 * @param {Object} message - The message object
 */
import { Meteor } from 'meteor/meteor';
import { _ } from 'meteor/underscore';
import { RocketChat } from 'meteor/rocketchat:lib';

import { code } from './code.js';

export const original = (message) => {
	let msg = message;

	if (!_.isString(message)) {
		if (message && message.html && _.trim(message.html)) {
			msg = message.html;
		} else {
			return message;
		}
	}

	const schemes = RocketChat.settings.get('Markdown_SupportSchemesForLink').split(',').join('|');

	// Support ![alt text](http://image url)
	msg = msg.replace(new RegExp(`!\\[([^\\]]+)\\]\\(((?:${schemes}):\\/\\/[^\\)]+)\\)`, 'gm'), (match, title, url) => {
		const target = url.indexOf(Meteor.absoluteUrl()) === 0 ? '' : '_blank';
		return `<a href="${url}" title="${title}" target="${target}"><div class="inline-image" style="background-image: url(${url})"></div></a>`;
	});

	// Support [Text](http://link)
	msg = msg.replace(new RegExp(`\\[([^\\]]+)\\]\\(((?:${schemes}):\\/\\/[^\\)]+)\\)`, 'gm'), (match, title, url) => {
		const target = url.indexOf(Meteor.absoluteUrl()) === 0 ? '' : '_blank';
		return `<a href="${url}" target="${target}">${title}</a>`;
	});

	// Support <http://link|Text>
	msg = msg.replace(new RegExp(`(?:<|&lt;)((?:${schemes}):\\/\\/[^\\|]+)\\|(.+?)(?=>|&gt;)(?:>|&gt;)`, 'gm'), (match, url, title) => {
		const target = url.indexOf(Meteor.absoluteUrl()) === 0 ? '' : '_blank';
		return `<a href="${url}" target="${target}">${title}</a>`;
	});

	if (RocketChat.settings.get('Markdown_Headers')) {
		// Support # Text for h1
		msg = msg.replace(/(?:^|\n)# (([\S\w\d-_\/\*\.,\\][ \u00a0\u1680\u180e\u2000-\u200a\u2028\u2029\u202f\u205f\u3000\ufeff]?)+)\n?/gm, '<h1>$1</h1>');

		// Support # Text for h2
		msg = msg.replace(/(?:^|\n)## (([\S\w\d-_\/\*\.,\\][ \u00a0\u1680\u180e\u2000-\u200a\u2028\u2029\u202f\u205f\u3000\ufeff]?)+)\n?/gm, '<h2>$1</h2>');

		// Support # Text for h3
		msg = msg.replace(/(?:^|\n)### (([\S\w\d-_\/\*\.,\\][ \u00a0\u1680\u180e\u2000-\u200a\u2028\u2029\u202f\u205f\u3000\ufeff]?)+)\n?/gm, '<h3>$1</h3>');

		// Support # Text for h4
		msg = msg.replace(/(?:^|\n)#### (([\S\w\d-_\/\*\.,\\][ \u00a0\u1680\u180e\u2000-\u200a\u2028\u2029\u202f\u205f\u3000\ufeff]?)+)\n?/gm, '<h4>$1</h4>');
	}

	// Support *text* to make bold
	msg = msg.replace(/(^|&gt;|[ >_~`])\*{1,2}([^\*\r\n]+)\*{1,2}([<_~`]|\B|\b|$)/gm, '$1<span class="copyonly">*</span><strong>$2</strong><span class="copyonly">*</span>$3');

	// Support _text_ to make italics
	msg = msg.replace(/(^|&gt;|[ >*~`])\_([^\_\r\n]+)\_([<*~`]|\B|\b|$)/gm, '$1<span class="copyonly">_</span><em>$2</em><span class="copyonly">_</span>$3');

	// Support ~text~ to strike through text
	msg = msg.replace(/(^|&gt;|[ >_*`])\~{1,2}([^~\r\n]+)\~{1,2}([<_*`]|\B|\b|$)/gm, '$1<span class="copyonly">~</span><strike>$2</strike><span class="copyonly">~</span>$3');

	// Support for block quote
	// >>>
	// Text
	// <<<
	msg = msg.replace(/(?:&gt;){3}\n+([\s\S]*?)\n+(?:&lt;){3}/g, '<blockquote class="background-transparent-darker-before"><span class="copyonly">&gt;&gt;&gt;</span>$1<span class="copyonly">&lt;&lt;&lt;</span></blockquote>');

	// Support >Text for quote
	msg = msg.replace(/^&gt;(.*)$/gm, '<blockquote class="background-transparent-darker-before"><span class="copyonly">&gt;</span>$1</blockquote>');

	// Remove white-space around blockquote (prevent <br>). Because blockquote is block element.
	msg = msg.replace(/\s*<blockquote class="background-transparent-darker-before">/gm, '<blockquote class="background-transparent-darker-before">');
	msg = msg.replace(/<\/blockquote>\s*/gm, '</blockquote>');

	// Remove new-line between blockquotes.
	msg = msg.replace(/<\/blockquote>\n<blockquote/gm, '</blockquote><blockquote');

	// Replace linebreak to br
	msg = msg.replace(/\n/gm, '<br>');

	if (!_.isString(message)) {
		message.html = msg;
	} else {
		message = msg;
	}

	// Support code blocks and inline code
	message = code(message);

	if (window && window.rocketDebug) {
		console.log('Markdown', message);
	}

	return message;
};
