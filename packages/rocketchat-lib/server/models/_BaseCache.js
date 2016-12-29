/* globals MongoInternals */
/* eslint new-cap: 0 */

import loki from 'lokijs';
import {EventEmitter} from 'events';
import objectPath from 'object-path';

const lokiEq = loki.LokiOps.$eq;

loki.LokiOps.$eq = function(a, b) {
	if (Array.isArray(a)) {
		return loki.LokiOps.$containsAny(a, b);
	}
	return lokiEq(a, b);
};

loki.LokiOps.$in = loki.LokiOps.$containsAny;
loki.LokiOps.$nin = loki.LokiOps.$containsNone;

loki.LokiOps.$exists = function(a, b) {
	if (b) {
		return loki.LokiOps.$ne(a, undefined);
	}

	return loki.LokiOps.$eq(a, undefined);
};


const ignore = [
	'emit',
	'load',
	'on',
	'addToAllIndexes'
];

function traceMethodCalls(target) {
	target._stats = {};

	for (const property in target) {
		if (typeof target[property] === 'function' && ignore.indexOf(property) === -1) {
			target._stats[property] = {
				calls: 0,
				time: 0,
				avg: 0
			};
			const origMethod = target[property];
			target[property] = function(...args) {

				if (target.loaded !== true) {
					return origMethod.apply(target, args);
				}

				const startTime = RocketChat.statsTracker.now();
				const result = origMethod.apply(target, args);
				const time = Math.round(RocketChat.statsTracker.now() - startTime) / 1000;
				target._stats[property].time += time;
				target._stats[property].calls++;
				target._stats[property].avg = target._stats[property].time / target._stats[property].calls;

				return result;
			};
		}
	}

	setInterval(function() {
		for (const property in target._stats) {
			if (target._stats.hasOwnProperty(property) && target._stats[property].time > 0) {
				const tags = [`property:${property}`, `collection:${target.collectionName}`];
				RocketChat.statsTracker.timing('cache.methods.time', target._stats[property].avg, tags);
				RocketChat.statsTracker.increment('cache.methods.totalTime', target._stats[property].time, tags);
				RocketChat.statsTracker.increment('cache.methods.count', target._stats[property].calls, tags);
				target._stats[property].avg = 0;
				target._stats[property].time = 0;
				target._stats[property].calls = 0;
			}
		}
	}, 10000);

	target._getStatsAvg = function() {
		const stats = [];
		for (const property in target._stats) {
			if (target._stats.hasOwnProperty(property)) {
				stats.push([Math.round(target._stats[property].avg*100)/100, property]);
			}
		}
		return _.sortBy(stats, function(record) {
			return record[0];
		});
	};
}

class Adapter {
	loadDatabase(/*dbname, callback*/) {}
	saveDatabase(/*dbname, dbstring, callback*/) {}
	deleteDatabase(/*dbname, callback*/) {}
}

const db = new loki('rocket.chat.json', {adapter: Adapter});

class ModelsBaseCache extends EventEmitter {
	constructor(model) {
		super();

		traceMethodCalls(this);

		this.indexes = {};
		this.ignoreUpdatedFields = ['_updatedAt'];

		this.query = {};
		this.options = {};

		this.ensureIndex('_id', 'unique');

		this.joins = {};

		this.on('inserted', (...args) => { this.emit('changed', 'inserted', ...args); });
		this.on('removed', (...args) => { this.emit('changed', 'removed', ...args); });
		this.on('updated', (...args) => { this.emit('changed', 'updated', ...args); });

		this.on('beforeinsert', (...args) => { this.emit('beforechange', 'inserted', ...args); });
		this.on('beforeremove', (...args) => { this.emit('beforechange', 'removed', ...args); });
		this.on('beforeupdate', (...args) => { this.emit('beforechange', 'updated', ...args); });

		this.on('inserted', (...args) => { this.emit('sync', 'inserted', ...args); });
		this.on('updated', (...args) => { this.emit('sync', 'updated', ...args); });
		this.on('beforeremove', (...args) => { this.emit('sync', 'removed', ...args); });

		this.db = db;

		this.model = model;

		this.collectionName = this.model._db.collectionName;
		this.collection = this.db.addCollection(this.collectionName);
	}

	hasOne(join, {field, link}) {
		this.join({join, field, link, multi: false});
	}

	hasMany(join, {field, link}) {
		this.join({join, field, link, multi: true});
	}

	join({join, field, link, multi}) {
		if (!RocketChat.models[join]) {
			console.log(`Invalid cache model ${join}`);
			return;
		}

		RocketChat.models[join].cache.on('inserted', (record) => {
			this.processRemoteJoinInserted({join, field, link, multi, record: record});
		});

		RocketChat.models[join].cache.on('beforeupdate', (record, diff) => {
			if (diff[link.remote]) {
				this.processRemoteJoinRemoved({join, field, link, multi, record: record});
			}
		});

		RocketChat.models[join].cache.on('updated', (record, diff) => {
			if (diff[link.remote]) {
				this.processRemoteJoinInserted({join, field, link, multi, record: record});
			}
		});

		RocketChat.models[join].cache.on('removed', (record) => {
			this.processRemoteJoinRemoved({join, field, link, multi, record: record});
		});

		this.on('inserted', (localRecord) => {
			this.processLocalJoinInserted({join, field, link, multi, localRecord: localRecord});
		});

		this.on('beforeupdate', (localRecord, diff) => {
			if (diff[link.local]) {
				if (multi === true) {
					localRecord[field] = [];
				} else {
					localRecord[field] = undefined;
				}
			}
		});

		this.on('updated', (localRecord, diff) => {
			if (diff[link.local]) {
				this.processLocalJoinInserted({join, field, link, multi, localRecord: localRecord});
			}
		});
	}

	processRemoteJoinInserted({field, link, multi, record}) {
		let localRecords = this._findByIndex(link.local, objectPath.get(record, link.remote));

		if (!localRecords) {
			return;
		}

		if (!Array.isArray(localRecords)) {
			localRecords = [localRecords];
		}

		for (var i = 0; i < localRecords.length; i++) {
			const localRecord = localRecords[i];
			if (multi === true && !localRecord[field]) {
				localRecord[field] = [];
			}

			if (typeof link.transform === 'function') {
				record = link.transform(localRecord, record);
			}

			if (multi === true) {
				localRecord[field].push(record);
			} else {
				localRecord[field] = record;
			}

			this.emit(`join:${field}:inserted`, localRecord, record);
			this.emit(`join:${field}:changed`, 'inserted', localRecord, record);
		}
	}

	processLocalJoinInserted({join, field, link, multi, localRecord}) {
		let records = RocketChat.models[join].cache._findByIndex(link.remote, objectPath.get(localRecord, link.local));

		if (!Array.isArray(records)) {
			records = [records];
		}

		for (let i = 0; i < records.length; i++) {
			let record = records[i];

			if (typeof link.transform === 'function') {
				record = link.transform(localRecord, record);
			}

			if (multi === true) {
				localRecord[field].push(record);
			} else {
				localRecord[field] = record;
			}

			this.emit(`join:${field}:inserted`, localRecord, record);
			this.emit(`join:${field}:changed`, 'inserted', localRecord, record);
		}
	}

	processRemoteJoinRemoved({field, link, multi, record}) {
		let localRecords = this._findByIndex(link.local, objectPath.get(record, link.remote));

		if (!localRecords) {
			return;
		}

		if (!Array.isArray(localRecords)) {
			localRecords = [localRecords];
		}

		for (var i = 0; i < localRecords.length; i++) {
			const localRecord = localRecords[i];

			if (multi === true) {
				if (Array.isArray(localRecord[field])) {
					if (typeof link.remove === 'function') {
						link.remove(localRecord[field], record);
					} else if (localRecord[field].indexOf(record) > -1) {
						localRecord[field].splice(localRecord[field].indexOf(record), 1);
					}
				}
			} else {
				localRecord[field] = undefined;
			}

			this.emit(`join:${field}:removed`, localRecord, record);
			this.emit(`join:${field}:changed`, 'removed', localRecord, record);
		}
	}

	ensureIndex(fields, type='array') {
		if (!Array.isArray(fields)) {
			fields = [fields];
		}

		this.indexes[fields.join(',')] = {
			type: type,
			fields: fields,
			data: {}
		};
	}

	addToAllIndexes(record) {
		for (const indexName in this.indexes) {
			if (this.indexes.hasOwnProperty(indexName)) {
				this.addToIndex(indexName, record);
			}
		}
	}

	addToIndex(indexName, record) {
		const index = this.indexes[indexName];
		if (!index) {
			console.error(`Index not defined ${indexName}`);
			return;
		}

		const keys = [];
		for (const field of index.fields) {
			keys.push(objectPath.get(record, field));
		}
		const key = keys.join('|');

		if (index.type === 'unique') {
			index.data[key] = record;
			return;
		}

		if (index.type === 'array') {
			if (!index.data[key]) {
				index.data[key] = [];
			}
			index.data[key].push(record);
			return;
		}
	}

	removeFromAllIndexes(record) {
		for (const indexName in this.indexes) {
			if (this.indexes.hasOwnProperty(indexName)) {
				this.removeFromIndex(indexName, record);
			}
		}
	}

	removeFromIndex(indexName, record) {
		const index = this.indexes[indexName];
		if (!this.indexes[indexName]) {
			console.error(`Index not defined ${indexName}`);
			return;
		}

		if (!index.data) {
			return;
		}

		let key = [];
		for (const field of index.fields) {
			key.push(objectPath.get(record, field));
		}
		key = key.join('|');

		if (index.type === 'unique') {
			index.data[key] = undefined;
			return;
		}

		if (index.type === 'array') {
			if (!index.data[key]) {
				return;
			}
			const i = index.data[key].indexOf(record);
			if (i > -1) {
				index.data[key].splice(i, 1);
			}
			return;
		}
	}

	_findByIndex(index, keys) {
		const key = [].concat(keys).join('|');
		if (!this.indexes[index]) {
			return;
		}

		if (this.indexes[index].data) {
			const result = this.indexes[index].data[key];
			if (result) {
				return result;
			}
		}

		if (this.indexes[index].type === 'array') {
			return [];
		}
	}

	findByIndex(index, keys, options={}) {
		return {
			fetch: () => {
				return this.processQueryOptionsOnResult(this._findByIndex(index, keys), options);
			},

			count: () => {
				const records = this.findByIndex(index, keys, options).fetch();
				if (Array.isArray(records)) {
					return records.length;
				}
				return !records ? 0 : 1;
			},

			forEach: (fn) => {
				const records = this.findByIndex(index, keys, options).fetch();
				if (Array.isArray(records)) {
					return records.forEach(fn);
				}
				if (records) {
					return fn(records);
				}
			}
		};
	}

	load() {
		if (this.model._useCache === false) {
			return;
		}

		console.log('Will load cache for', this.collectionName);
		this.emit('beforeload');
		this.loaded = false;
		const time = RocketChat.statsTracker.now();
		const data = this.model.db.find(this.query, this.options).fetch();
		for (let i=0; i < data.length; i++) {
			this.insert(data[i]);
		}
		console.log(String(data.length), 'records load from', this.collectionName);
		RocketChat.statsTracker.timing('cache.load', RocketChat.statsTracker.now() - time, [`collection:${this.collectionName}`]);
		// this.startOplog();
		this.startSync();
		this.loaded = true;
		this.emit('afterload');
	}

	defineSyncStrategy(query, modifier) {
		const dbModifiers = [
			'$currentDate',
			'$bit',
			'$pull',
			'$pushAll',
			'$push'
		];

		const modifierKeys = Object.keys(modifier);

		if (_.intersection(modifierKeys, dbModifiers).length > 0) {
			return 'db';
		}

		const placeholderFields = Object.keys(query).filter(item => item.indexOf('$') > -1);
		if (placeholderFields.length > 0) {
			return 'db';
		}

		// if (_.intersection(modifierKeys, inMemoryModifiers).length > 0) {
		return 'cache';
		// }
	}

	startSync() {
		const db = this.model._db;

		// INSERT
		// db.on('beforeInsert', (record) => {
		// 	console.log('beforeInsert', JSON.stringify(record));
		// });
		db.on('afterInsert', (beforeInsert, _id, record) => {
			record._id = _id;
			// console.log('afterInsert', JSON.stringify(record));
			this.insert(record);
		});

		// REMOVE
		// db.on('beforeRemove', (query, records) => {
		// 	for (const record of records) {
		// 		this.removeById(record._id);
		// 	}
		// });

		// UPDATE
		db.on('beforeUpdate', (query, update, options = {}) => {
			if (this.defineSyncStrategy(query, update) === 'db') {
				const findOptions = {fields: {_id: 1}};
				let records = options.multi ? db.find(query, findOptions).fetch() : db.findOne(query, findOptions);
				if (records && !Array.isArray(records)) {
					records = [records];
				} else {
					records = [];
				}
				for (const key in query) {
					if (query.hasOwnProperty(key)) {
						delete query[key];
					}
				}
				query._id = {
					$in: records.map(item => item._id)
				};
				return 'db';
			}
		});

		db.on('afterUpdate', (beforeUpdate, result, query, update, options = {}) => {
			if (beforeUpdate === 'db') {
				// Find only updated fields?
				let records = options.multi ? db.find(query).fetch() : db.findOne(query);
				if (records && !Array.isArray(records)) {
					records = [records];
				} else {
					records = [];
				}
				for (const record of records) {
					this.updateDiffById(record._id, record);
				}
			} else {
				this.update(query, update, options);
			}
		});

		db.on('beforeUpsert', (query, update) => {
			console.log('beforeUpsert', {query: JSON.stringify(query), update: JSON.stringify(update)});
		});

		// db.on('afterUpsert', (beforeUpsert, result, query, update) => {
		// 	console.log('afterUpsert', {beforeUpsert, result, query, update});
		// });
	}

	startOplog() {
		const query = {
			collection: this.collectionName
		};

		if (!MongoInternals.defaultRemoteCollectionDriver().mongo._oplogHandle || !MongoInternals.defaultRemoteCollectionDriver().mongo._oplogHandle.onOplogEntry) {
			console.error('\nYour MongoDB is not with ReplicaSet enabled.\nPlease enable it.\nYou can see more information at:\n* https://docs.mongodb.com/v3.2/tutorial/convert-standalone-to-replica-set/ \n* https://github.com/RocketChat/Rocket.Chat/issues/5212\n');
			throw new Meteor.Error('Your MongoDB is not with ReplicaSet enabled.');
		}

		MongoInternals.defaultRemoteCollectionDriver().mongo._oplogHandle.onOplogEntry(query, (record) => {
			this.processOplogRecord(record);
		});
	}

	processOplogRecord(action) {
		if (action.op.op === 'i') {
			this.insert(action.op.o);
			return;
		}

		if (action.op.op === 'u') {
			let diff = {};

			if (!action.op.o.$set && !action.op.o.$unset) {
				diff = action.op.o;
			} else {
				if (action.op.o.$set) {
					for (let key in action.op.o.$set) {
						if (action.op.o.$set.hasOwnProperty(key)) {
							diff[key] = action.op.o.$set[key];
						}
					}
				}

				if (action.op.o.$unset) {
					for (let key in action.op.o.$unset) {
						if (action.op.o.$unset.hasOwnProperty(key)) {
							diff[key] = undefined;
						}
					}
				}
			}

			this.updateDiffById(action.id, diff);
			return;
		}

		if (action.op.op === 'd') {
			this.removeById(action.id);
			return;
		}
	}

	processQueryOptionsOnResult(result, options={}) {
		if (result === undefined || result === null) {
			return undefined;
		}

		if (Array.isArray(result)) {
			if (options.sort) {
				result = result.sort((a, b) => {
					let r = 0;
					for (const field in options.sort) {
						if (options.sort.hasOwnProperty(field)) {
							const direction = options.sort[field];
							let valueA;
							let valueB;
							if (field.indexOf('.') > -1) {
								valueA = objectPath.get(a, field);
								valueB = objectPath.get(b, field);
							} else {
								valueA = a[field];
								valueB = b[field];
							}
							if (valueA > valueB) {
								r = direction;
								break;
							}
							if (valueA < valueB) {
								r = -direction;
								break;
							}
						}
					}
					return r;
				});
			}

			if (typeof options.limit === 'number') {
				result.splice(options.limit);
			}
		}

		if (!options.fields) {
			options.fields = {};
		}

		const fieldsToRemove = [];
		const fieldsToGet = [];

		for (const field in options.fields) {
			if (options.fields.hasOwnProperty(field)) {
				if (options.fields[field] === 0) {
					fieldsToRemove.push(field);
				} else if (options.fields[field] === 1) {
					fieldsToGet.push(field);
				}
			}
		}

		if (fieldsToRemove.length > 0 && fieldsToGet.length > 0) {
			console.error('Can\'t mix remove and get fields');
			fieldsToRemove.splice(0, fieldsToRemove.length);
		}

		if (fieldsToGet.length > 0 && fieldsToGet.indexOf('_id') === -1) {
			fieldsToGet.push('_id');
		}

		let pickFields = (obj, fields) => {
			let picked = {};
			fields.forEach((field) => {
				if (field.indexOf('.') !== -1) {
					objectPath.set(picked, field, objectPath.get(obj, field));
				} else {
					picked[field] = obj[field];
				}
			});
			return picked;
		};

		if (fieldsToRemove.length > 0 || fieldsToGet.length > 0) {
			if (Array.isArray(result)) {
				result = result.map((record) => {
					if (fieldsToRemove.length > 0) {
						return _.omit(record, ...fieldsToRemove);
					}

					if (fieldsToGet.length > 0) {
						return pickFields(record, fieldsToGet);
					}
				});
			} else {
				if (fieldsToRemove.length > 0) {
					return _.omit(result, ...fieldsToRemove);
				}

				if (fieldsToGet.length > 0) {
					return pickFields(result, fieldsToGet);
				}
			}
		}

		return result;
	}

	processQuery(query) {
		if (!query) {
			return query;
		}

		if (Match.test(query, String)) {
			return {
				_id: query
			};
		}

		if (Object.keys(query).length > 1) {
			const and = [];
			for (const field in query) {
				if (query.hasOwnProperty(field)) {
					and.push({
						[field]: query[field]
					});
				}
			}
			query = {$and: and};
		}

		for (const field in query) {
			if (query.hasOwnProperty(field)) {
				const value = query[field];
				if (value instanceof RegExp && field !== '$regex') {
					query[field] = {
						$regex: value
					};
				}

				if (field === '$and' || field === '$or') {
					query[field] = value.map((subValue) => {
						return this.processQuery(subValue);
					});
				}

				if (Match.test(value, Object) && Object.keys(value).length > 0) {
					query[field] = this.processQuery(value);
				}
			}
		}

		return query;
	}

	find(query, options={}) {
		return {
			fetch: () => {
				try {
					query = this.processQuery(query);
					return this.processQueryOptionsOnResult(this.collection.find(query), options);
				} catch (e) {
					console.error('Exception on cache find for', this.collectionName, ...arguments);
					console.error(e.stack);
				}
			},

			count: () => {
				try {
					query = this.processQuery(query);
					return this.collection.find(query).length;
				} catch (e) {
					console.error('Exception on cache find for', this.collectionName, ...arguments);
					console.error(e.stack);
				}
			},

			forEach: (fn) => {
				return this.find(query, options).fetch().forEach(fn);
			},

			observe: (obj) => {
				console.log(this.collectionName, 'Falling back observe to model with query:', query);
				return this.model.db.find(...arguments).observe(obj);
			},

			observeChanges: (obj) => {
				console.log(this.collectionName, 'Falling back observeChanges to model with query:', query);
				return this.model.db.find(...arguments).observeChanges(obj);
			},

			_publishCursor: (cursor, sub, collection) => {
				console.log(this.collectionName, 'Falling back _publishCursor to model with query:', query);
				return this.model.db.find(...arguments)._publishCursor(cursor, sub, collection);
			}
		};
	}

	findOne(query, options) {
		query = this.processQuery(query);
		return this.processQueryOptionsOnResult(this.collection.findOne(query), options);
	}

	findOneById(_id, options) {
		return this.findByIndex('_id', _id, options).fetch();
	}

	findWhere(query, options) {
		query = this.processQuery(query);
		return this.processQueryOptionsOnResult(this.collection.findWhere(query), options);
	}

	addDynamicView() {
		return this.collection.addDynamicView(...arguments);
	}

	getDynamicView() {
		return this.collection.getDynamicView(...arguments);
	}

	insert(record) {
		if (Array.isArray(record)) {
			for (let i=0; i < record.length; i++) {
				// TODO remove - ignore updates in room.usernames
				if (this.collectionName === 'rocketchat_room' && record[i].usernames) {
					delete record[i].usernames;
				}
				this.emit('beforeinsert', record[i]);
				this.addToAllIndexes(record[i]);
				this.collection.insert(record[i]);
				this.emit('inserted', record[i]);
			}
		} else {
			// TODO remove - ignore updates in room.usernames
			if (this.collectionName === 'rocketchat_room' && record.usernames) {
				delete record.usernames;
			}
			this.emit('beforeinsert', record);
			this.addToAllIndexes(record);
			this.collection.insert(record);
			this.emit('inserted', record);
		}
	}

	updateDiffById(id, diff) {
		// TODO remove - ignore updates in room.usernames
		if (this.collectionName === 'rocketchat_room' && diff.usernames) {
			delete diff.usernames;
		}

		const record = this._findByIndex('_id', id);
		if (!record) {
			console.error('Cache.updateDiffById: No record', this.collectionName, id, diff);
			return;
		}

		const updatedFields = _.without(Object.keys(diff), ...this.ignoreUpdatedFields);

		if (updatedFields.length > 0) {
			this.emit('beforeupdate', record, diff);
		}

		for (let key in diff) {
			if (diff.hasOwnProperty(key)) {
				objectPath.set(record, key, diff[key]);
			}
		}

		this.collection.update(record);

		if (updatedFields.length > 0) {
			this.emit('updated', record, diff);
		}
	}

	updateRecord(record, update) {
		// TODO remove - ignore updates in room.usernames
		if (this.collectionName === 'rocketchat_room' && (record.usernames || (record.$set && record.$set.usernames))) {
			delete record.usernames;
			if (record.$set && record.$set.usernames) {
				delete record.$set.usernames;
			}
		}

		const topLevelFields = Object.keys(update).map(field => field.split('.')[0]);
		const updatedFields = _.without(topLevelFields, ...this.ignoreUpdatedFields);

		if (updatedFields.length > 0) {
			this.emit('beforeupdate', record, record);
		}

		if (update.$set) {
			_.each(update.$set, (value, field) => {
				objectPath.set(record, field, value);
			});
		}

		if (update.$unset) {
			_.each(update.$unset, (value, field) => {
				objectPath.del(record, field);
			});
		}

		if (update.$min) {
			_.each(update.$min, (value, field) => {
				let curValue = objectPath.get(record, field);
				if (curValue === undefined || value < curValue) {
					objectPath.set(record, field, value);
				}
			});
		}

		if (update.$max) {
			_.each(update.$max, (value, field) => {
				let curValue = objectPath.get(record, field);
				if (curValue === undefined || value > curValue) {
					objectPath.set(record, field, value);
				}
			});
		}

		if (update.$inc) {
			_.each(update.$inc, (value, field) => {
				let curValue = objectPath.get(record, field);
				if (curValue === undefined) {
					curValue = value;
				} else {
					curValue += value;
				}
				objectPath.set(record, field, curValue);
			});
		}

		if (update.$mul) {
			_.each(update.$mul, (value, field) => {
				let curValue = objectPath.get(record, field);
				if (curValue === undefined) {
					curValue = 0;
				} else {
					curValue *= value;
				}
				objectPath.set(record, field, curValue);
			});
		}

		if (update.$rename) {
			_.each(update.$rename, (value, field) => {
				let curValue = objectPath.get(record, field);
				if (curValue !== undefined) {
					objectPath.set(record, value, curValue);
					objectPath.del(record, field);
				}
			});
		}

		if (update.$pullAll) {
			_.each(update.$pullAll, (value, field) => {
				let curValue = objectPath.get(record, field);
				if (Array.isArray(curValue)) {
					curValue = _.difference(curValue, value);
					objectPath.set(record, field, curValue);
				}
			});
		}

		if (update.$pop) {
			_.each(update.$pop, (value, field) => {
				let curValue = objectPath.get(record, field);
				if (Array.isArray(curValue)) {
					if (value === -1) {
						curValue.shift();
					} else {
						curValue.pop();
					}
					objectPath.set(record, field, curValue);
				}
			});
		}

		if (update.$addToSet) {
			_.each(update.$addToSet, (value, field) => {
				let curValue = objectPath.get(record, field);
				if (curValue === undefined) {
					curValue = [];
				}
				if (Array.isArray(curValue)) {
					const length = curValue.length;

					if (value && value.$each && Array.isArray(value.$each)) {
						for (const valueItem of value.$each) {
							if (curValue.indexOf(valueItem) === -1) {
								curValue.push(valueItem);
							}
						}
					} else if (curValue.indexOf(value) === -1) {
						curValue.push(value);
					}

					if (curValue.length > length) {
						objectPath.set(record, field, curValue);
					}
				}
			});
		}

		// '$setOnInsert', // { $setOnInsert: { <field1>: <value1>, ... } }, upsert only

		this.collection.update(record);

		if (updatedFields.length > 0) {
			this.emit('updated', record, record);
		}
	}

	update(query, update, options = {}) {
		console.log('update', {query: JSON.stringify(query), update: JSON.stringify(update), options});
		let records = options.multi ? this.find(query).fetch() : this.findOne(query);
		if (records && !Array.isArray(records)) {
			records = [records];
		} else {
			records = [];
		}

		for (const record of records) {
			this.updateRecord(record, update);
		}
	}

	removeById(id) {
		const record = this._findByIndex('_id', id);
		if (record) {
			this.emit('beforeremove', record);
			this.collection.removeWhere({_id: id});
			this.removeFromAllIndexes(record);
			this.emit('removed', record);
		}
	}
}

export default ModelsBaseCache;
