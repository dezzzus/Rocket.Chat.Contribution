/* eslint-env mocha */

const supertest = require('supertest');
const request = supertest('http://localhost:3000');

const user = {username: 'rocketchat.internal.admin.test', password: 'rocketchat.internal.admin.test', name: 'RocketChat Internal Admin Test', email: 'rocketchat.internal.admin.test@rocket.chat', accessToken: null};
const channel = {};
const message = {content: 'Test Message GraphQL', modifiedContent: 'Test Message GraphQL Modified'};

const { expect } = require('chai');


describe('GraphQL Tests', function() {
	this.retries(0);

	it('Is able to login with username and password', (done) => {
		const query = `
        mutation login{
          loginWithPassword(user: {username: "${ user.username }"}, password: "${ user.password }") {
            user {
              username,
							email
            },
            tokens {
              accessToken
            }
          }
        }`;
		request.post('/graphql')
			.send({
				query
			})
			.expect('Content-Type', 'application/json')
			.expect(200)
			.expect((res) => {
				expect(res.body).to.have.property('data');
				expect(res.body).to.not.have.property('errors');
				const data = res.body.data.loginWithPassword;
				expect(data).to.have.property('user');
				expect(data).to.have.property('tokens');
				user.accessToken = data.tokens.accessToken;
				expect(data.user).to.have.property('username', user.username);
				expect(data.user).to.have.property('email', user.email);

			})
			.end(done);
	});
	it('Is able to login with email and password', (done) => {
		const query = `
        mutation login{
          loginWithPassword(user: {email: "${ user.email }"}, password: "${ user.password }") {
            user {
              username,
							email
            },
            tokens {
              accessToken
            }
          }
        }`;
		request.post('/graphql')
			.send({
				query
			})
			.expect('Content-Type', 'application/json')
			.expect(200)
			.expect((res) => {
				expect(res.body).to.have.property('data');
				expect(res.body).to.not.have.property('errors');
				const data = res.body.data.loginWithPassword;
				expect(data).to.have.property('user');
				expect(data).to.have.property('tokens');
				user.accessToken = data.tokens.accessToken;
				expect(data.user).to.have.property('username', user.username);
				expect(data.user).to.have.property('email', user.email);
			})
			.end(done);
	});
	it('Fails when trying to login with wrong password', (done) => {
		const query = `
        mutation login{
          loginWithPassword(user: {username: "${ user.username }"}, password: "not!${ user.password }") {
            user {
              username
            },
            tokens {
              accessToken
            }
          }
        }`;
		request.post('/graphql')
			.send({
				query
			})
			.expect('Content-Type', 'application/json')
			.expect(200)
			.expect((res) => {
				expect(res.body).to.have.property('data');
				expect(res.body).to.have.property('errors');
				expect(res.body.data).to.have.property('loginWithPassword', null);
				expect(res.body.errors[0]).to.have.property('message', 'Incorrect password');
			})
			.end(done);
	});

	it('Is able to get user data (/me)', (done) => {
		const query = `
				{
					me {
						username,
						name,
						email,
						channels {
							id,
							name
						},
						directMessages {
							id,
							name
						}
					}
				}`;
		request.post('/graphql')
			.set('Authorization', user.accessToken)
			.send({
				query
			})
			.expect('Content-Type', 'application/json')
			.expect(200)
			.expect((res) => {
				expect(res.body).to.have.property('data');
				expect(res.body).to.not.have.property('errors');
				const me = res.body.data.me;
				expect(me).to.have.property('username', user.username);
				expect(me).to.have.property('name', user.name);
				expect(me).to.have.property('email', user.email);
				expect(me.channels).to.be.an('array');
				expect(me.channels[0]).to.have.property('id');
				channel.id = me.channels[0].id;
			})
			.end(done);
	});

	it('Is able to send messages to channel', (done) => {
		const query = `
        mutation sendMessage{
          sendMessage(channelId: "${ channel.id }", content: "${ message.content }") {
						id,
						author {
							username,
							name
						},
						content,
						channel {
							name,
							id
						},
						reactions {
							username,
							icon
						}
					}
        }`;
		request.post('/graphql')
			.set('Authorization', user.accessToken)
			.send({
				query
			})
			.expect('Content-Type', 'application/json')
			.expect(200)
			.expect((res) => {
				expect(res.body).to.have.property('data');
				expect(res.body).to.not.have.property('errors');
				const data = res.body.data.sendMessage;
				expect(data).to.have.property('id');
				message.id = data.id;
				expect(data).to.have.property('author');
				expect(data.author).to.have.property('username', user.username);
				expect(data).to.have.property('content', message.content);
				expect(data).to.have.property('channel');
				expect(data.channel).to.have.property('id', channel.id);
				expect(data).to.have.property('reactions', null);
			})
			.end(done);
	});
	it('Is able to edit messages', (done) => {
		const query = `
			mutation editMessage {
				editMessage(id: {messageId: "${ message.id }", channelId: "${ channel.id }"}, content: "${ message.modifiedContent }") {
					id,
					content,
					author {
						username
					},
					channel {
						id,
						name
					}
				}
			}`;
		request.post('/graphql')
			.set('Authorization', user.accessToken)
			.send({
				query
			})
			.expect('Content-Type', 'application/json')
			.expect(200)
			.expect((res) => {
				expect(res.body).to.have.property('data');
				expect(res.body).to.not.have.property('errors');
				const data = res.body.data.editMessage;
				expect(data).to.have.property('id');
				expect(data).to.have.property('author');
				expect(data.author).to.have.property('username', user.username);
				expect(data).to.have.property('content', message.modifiedContent);
				expect(data).to.have.property('channel');
				expect(data.channel).to.have.property('id', channel.id);
			})
			.end(done);
	});
});

/*
subscription chatMessageAdded {
  chatMessageAdded(channelId: "Y2EH9PaCy8cw2Ppvm") {
    id,
    channel {
      name
    }
  }
}

{
  channels(filter: {joinedChannels: true}) {
    name,
    id
  }
}

mutation newMessage {
  sendMessage(channelId: "Y2EH9PaCy8cw2Ppvm", content: "Testing") {
    author {
      name
    },
    channel {
      name
    },
    content
  }
}

{
  messages(channelId: "Y2EH9PaCy8cw2Ppvm") {
    messagesArray {
      id,
      author {
        name,
        id
      },
      content,
      reactions {
        username,
        icon
      }
    }
  }
}

mutation editMessage {
  editMessage(id: {messageId: "8yi7ZNpXo2kakcecz", channelId: "Y2EH9PaCy8cw2Ppvm"}, content: "Hi edit") {
    author {
      name
    },
    channel {
      name
    },
    content
  }
}

mutation login{
  loginWithPassword(user: {username: "gdelavald"}, password: "gdelavald") {
    user {
      name
    },
    tokens {
      accessToken
    }
  }
}

*/
