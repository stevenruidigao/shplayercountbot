const configFile = './config.json';

const adjectives = require('./adjectives');
const config = require(configFile);
const Discord = require('discord.js');
const fs = require('fs');
const https = require('https');
const io = require('socket.io-client');
const nouns = require('./nouns');

var calibration = (config.calibration ? config.calibration : 0);
var chatLog = fs.createWriteStream('chat.log', {flags: 'a'});
var client = new Discord.Client();
var count = getOnlineUsers();
var iid = [];
var lastEnabled = new Date(config.lastEnabled ? config.lastEnabled : null);
var lastReconnectAttempt = Date();
var logFile = fs.createWriteStream('log.log', {flags:'a'});
var names = new Map();
var savedUsers = fs.createWriteStream('users.log', {flags:'a'});
var servers = new Map();
var signupInProgress = false;
var signupStatus = 'enabled';

gameChatBot();

if (config.token) client.login(config.token);

client.on('ready', () => {
	log('\n', logFile);
	logWithTime('***** Logged in as ' + client.user.tag + '! *****', logFile);
	update(randomAnimal(6, 12), randomAnimal(6, 12));
});

client.on('message', async msg => {
	if (msg.author.bot) return;
	
	var server = servers.get(msg.guild.id);
	if (!server) {
		server = {
			channels: new Map()
		}
		servers.set(msg.guild.id, server);
	}
	
	var channel = server.channels.get(msg.channel.id);
	if (!channel) {
		channel = {
			waiting: []
		}
		server.channels.set(msg.channel.id, channel);
	}
	
	if (msg.content === 'last.enabled') {
		replyLastEnabled(msg);
		
	} else if (msg.content === 'player.count') {
		replyPlayerCount(msg);
	
	} else if (msg.content === 'sign.ups') {
		replySignupsEnabled(msg);
	
	} else if (msg.content === 'ping.me.acsu') {
		pingWhenSignupsEnabled(msg);
		
	}
});

async function gameChatBot() {
	var socket = await signin(config.username, config.password);
	
	// console.log(socket.io.opts.transportOptions.polling);

	socket.on('connect', () => {
		console.log('Socket connected.');
		socket.emit('hasSeenNewPlayerModal');
		socket.emit('updateUserStatus');
		socket.emit('getUserGameSettings');
		socket.emit('sendUser', {
			userName: config.username,
			verified: false,
			staffRole: '',
			hasNotDismissedSignupModal: false
		});
		setTimeout(() => calibrate(socket), 1000);
		socket.emit('upgrade');
		// socket.emit('sendUser', {
			// userName: config.username,
			// verified: false,
			// staffRole: '',
			// hasNotDismissedSignupModal: false
		// });
	});
		
	socket.on('touChange', changeList => {
		socket.emit('confirmTOU');
	});
	
	socket.on('fetchUser', () => {
		socket.emit('sendUser', {
			userName: config.username,
			verified: false,
			staffRole: '',
			hasNotDismissedSignupModal: false
		});
	});
	
	socket.on('userList', list => {
		var now = new Date();
		var since = now - this.lastReconnectAttempt;
		if (since > 5000) {
			lastReconnectAttempt = now;
			if (!list.list.map(user => config.username).includes(config.username)) {
				console.log('Detected own user not in list, attempting to reconnect...');
				socket.emit('getUserGameSettings');
			}
		}
	});
	
	socket.on('manualDisconnection', async () => {
		console.log('Disconnected');
		socket = await signin(config.username, config.password);
	});
	
	socket.on('generalChats', chats => {
		var msg = chats.list[chats.list.length - 1];
		chatLog.write(msg.chat + '\n');
		if (msg) {
			if (msg.chat === 'l.astenabled') {
				if (lastEnabled) reply('Signups were last enabled on **' + lastEnabled.toUTCString() + '** .', socket);
				
				else reply('Signups haven\'t been enabled since this bot was last started.', socket);
				
			} else if (msg.chat === 'p.ing') {
				console.log(BigInt(Date.now()) + ' : ' + Date.parse(msg.time) + ' Pong! Latency is ' + (Date.now() - Date.parse(msg.time)) + 'ms.');
				reply('Pong! Latency is **' + (Date.now() - Date.parse(msg.time) + calibration) + '** ms.', socket);
				
			} else if (msg.chat === 'p.layercount') {
				reply('There are currently **' + count + '** players online.', socket);
				
			} else if (msg.chat === 's.ignups') {
				reply('Signups are currently **' + signupStatus + '** .', socket);
				
			} else if (msg.chat === 't.raffic' && signupStatus !== 'eanbled') {
				reply('Signups are disabled due to heavy traffic and granting exceptions at the moment is not possible as it would make the servers lag even more. We\'re working to fix these issues, so please check back later for updates! Sorry for the inconvenience!', socket);
				
			} else if (msg.chat === 'c.alibrate' && msg.userName === 'stevengao') {
					calibrate(socket);
					
			} else if (msg.chat === 'calibrating' && msg.userName === 'acsutest') {
				var received = Date.now();
				calibration = Date.parse(msg.time) - (received - calibration) / 2 - calibration;
				config.calibration = calibration;
				updateConfig(config, configFile);
			}
		}
	});
}

function log(string, file) {
	console.log(string);
	file.write(string + '\n');
}

function makeJSONRequest(options) {
	return new Promise((resolve, reject) => {
		var json = '';
		var data = {};

		https.get(options, res => {
			res.on('data', chunk => {
				json += chunk;
			});
			res.on('end', () => {
				if (res.statusCode === 200) {
					try {
						data = JSON.parse(json);
						// data is available here:
						resolve(data);
						
					} catch (e) {
						reject(e);
					}
					
				} else {
					reject(res.statusCode);
				}
			});
		}).on('error', function (err) {
			reject(err);
		});
	});
}

async function makePOSTRequest(options, encodedData) {
	return new Promise((resolve, reject) => {
		var json = '';
		var data = null;
		
		var req = https.request(options, res => {
			res.on('data', chunk => {
				json += chunk;
			});
			res.on('end', () => {
				if (res.statusCode === 200) {
					try {
						if (json.length > 0) data = JSON.parse(json);
						resolve({
							data: data,
							error: null,
							headers: res.headers,
							statusCode: res.statusCode
						});
						
					} catch (e) {
						// log(e, logFile);
						reject({
							data: data,
							error: e,
							headers: res.headers,
							statusCode: res.statusCode
						});
					}
					
				} else {
					try {
						if (json.length > 0) data = JSON.parse(json);
						reject({
							data: data,
							error: null,
							headers: res.headers,
							statusCode: res.statusCode
						});
						
					} catch (e) {
						// log(e, logFile);
						reject({
							data: data,
							error: e,
							headers: res.headers,
							statusCode: res.statusCode
						});
					}
				}
			});
		}).on('error', function (err) {
			reject({
				data: null,
				error: err,
				headers: null,
				statusCode: null
			});
		});
		req.write(encodedData);
		req.end();
	});
}

function reply(message, socket) {
	// console.log(socket);
	socket.emit('addNewGeneralChat', {
		username: config.username,
		chat: message
	});
	
}

function randomAnimal(min, max) {
	var string = nouns[Math.floor(Math.random() * nouns.length)];
	while (string.length < min + Math.floor(Math.random() * (max - min + 1))) string = adjectives[Math.floor(Math.random() * adjectives.length)] + string;
	string = string.substring(0, max);
	return string;
}

function updateConfig(config, path) {
	fs.writeFile(path, JSON.stringify(config, null, 2), (err) => {
		if (err) console.error(err);
	});
}

function calibrate(socket) {
	reply('calibrating', socket)
	calibration = Date.now();
}

async function getOnlineUsers() {
	var options = {
		host: 'secrethitler.io',
		path: '/online-playercount',
		headers: {'User-Agent': 'request'}
	};

	try {
		var JSONPromise = await makeJSONRequest(options);
		var data = await JSONPromise;
		return data.count;
		
	} catch(e) {
		logWithTime('Something\'s wrong, please try again later', logFile);
	}
}

async function getSID(user, pass) {
	var encodedData = 'username=' + user + '&password=' + pass;
	
	var signinOptions = {
		host: 'secrethitler.io',
		path: '/account/signin',
		method: 'POST',
        headers: {
			'Content-Length': Buffer.byteLength(encodedData),
			'Content-Type': 'application/x-www-form-urlencoded' // 'application/json',
        }
	}
	try {
		var response = await makePOSTRequest(signinOptions, encodedData);
		return response.headers['set-cookie'][0].split(';')[0]; //.split('=')[1].split(';')[0];
		
	} catch(e) {
		return e.headers['set-cookie'][0].split(';')[0]; //.split('=')[1].split(';')[0];
	}
}

function logWithTime(string, file) {
	var dateTime = new Date(); // Date.now()
	log((dateTime.getMonth() + 1).toString().padStart(2, '0') + '/' + dateTime.getDate().toString().padStart(2, '0') + '/' + dateTime.getFullYear() + ' ' + dateTime.getHours().toString().padStart(2, '0') + ':' + dateTime.getMinutes().toString().padStart(2, '0') + ':' + dateTime.getSeconds().toString().padStart(2, '0') + '.' + dateTime.getMilliseconds().toString().padStart(3, '0') + ': ' + string, file);
}

async function signin(user, pass) {
	if (user && pass) {
		var SID = await getSID(user, pass);
		
		var socketOptions = {
			reconnect: true,
			transportOptions: {
				polling: {
					extraHeaders: {
						'Cookie': SID
					}
				}
			}
		}
	}
	
	socket = await io('https://secrethitler.io', socketOptions);
	return socket;
}

async function signup(user, email, pass, isPrivate, bypassKey) {
	var result = {
		data: null,
		error: null,
		headers: null,
		statusCode: null
	}
	
	if (signupInProgress) return result;
	
	signupInProgress = true;
	
	var encodedData = 'username=' + user + '&password=' + pass + '&password2=' + pass + '&email=' + email + '&isPrivate=' + isPrivate + '&bypassKey=' + bypassKey;
	
	var signupOptions = {
		host: 'secrethitler.io',
		path: '/account/signup',
		method: 'POST',
        headers: {
			'Content-Length': Buffer.byteLength(encodedData),
			'Content-Type': 'application/x-www-form-urlencoded' // 'application/json',
        }
	}
	
	
	try {
		result = await makePOSTRequest(signupOptions, encodedData);
	
	} catch(e) {
		result = e;
	}
	
	// logWithTime('Signups are ' + signupStatus, logFile);
	
	signupInProgress = false;
	return result;
	// return signupStatus === 'enabled';
}

async function signupsEnabled(user, pass, isPrivate, bypassKey) {
	if (signupInProgress) return {
		signupStatus: signupStatus,
		lastEnabled: lastEnabled,
		user: user,
		pass: pass
	};
	
	var email = '';
	
	// username=acsutest&password=redacted&password2=redacted&email=acsutest@gmail.com&isPrivate=false&bypassKey=" https://secrethitler.io/account/signup
	
	log('\n' + user + ' : ' + pass + '\n', logFile);
	
	// var encodedData = 'username=' + username + '&password=' + passwd + '&password2=' + passwd + '&email=' + email + '&isPrivate=false&bypassKey='; // JSON.stringify(data);
	
	// var deleteAccountOptions = {
		// host: 'secrethitler.io',
		// path: '/account/delete-account',
		// method: 'POST',
        // headers: {
			// 'Content-Length': Buffer.byteLength(encodedData),
			// 'Content-Type': 'application/x-www-form-urlencoded' // 'application/json',
        // }
	// }
	
	try {
		// try {
			// await makePOSTRequest(deleteAccountOptions, encodedData);
			
		// } catch (e) {
		// }
		
		var response = await signup(user, email, pass, isPrivate, bypassKey);
		
		if (!response.error && response.statusCode === 200) {
			lastEnabled = new Date();
			signupStatus = 'enabled';
			log(user + ' : ' + passwd + '\n', savedUsers);
			user = await randomAnimal(6, 12);
			pass = await randomAnimal(6, 12);
			
		} else {
			signupStatus = 'disabled';
			
			if (response.data) {
				if (response.data.message === 'You can only make accounts once per day.  If you need an exception to this rule, contact the moderators on our discord channel.') signupStatus = 'enabled';
				else if (response.statusCode === 401 || response.data.message === 'That account already exists.' 
													 || response.data.message === 'Your username contains a naughty word or part of a naughty word.') {
					user = await randomAnimal(6, 12);
					pass = await randomAnimal(6, 12);
				}
				
			} else if (error && !response.data) {
					lastEnabled = new Date();
					signupStatus = 'enabled';
					log('*' + username + ' : ' + passwd + '\n', savedUsers);
					user = await randomAnimal(6, 12);
					pass = await randomAnimal(6, 12);
			}
			
			delete response.headers;
			logWithTime(JSON.stringify(response), logFile);
		}
	
	} catch(e) {
		logWithTime(e, logFile);
		signupStatus = 'disabled';
	}
	
	config.lastEnabled = lastEnabled;
	updateConfig(config, configFile);
	
	return {
		signupStatus: signupStatus,
		lastEnabled: lastEnabled,
		user: user,
		pass: pass
	};
}

async function replyLastEnabled(msg) {
	if (lastEnabled) msg.channel.send('<@' + msg.author.id + '> Signups were last enabled on ' + lastEnabled.toUTCString())
		.catch(console.error);
	else msg.channel.send('<@' + msg.author.id + '> Signups haven\'t been enabled since this bot was last started.')
		.catch(console.error);
}

async function replyPlayerCount(msg) {
	// if (iid.length === 0) {
		// clearInterval(iid[0]);
		// clearInterval(iid[1]);
	// }
	
	// iid = await updateStatus();
	msg.channel.send('<@' + msg.author.id + '> There are currently ' + count + ' players online.')
		.catch(console.error);
}

async function replySignupsEnabled(msg) {
	// if (signupInProgress) {
		// msg.channel.send('<@' + msg.author.id + '> signups are currently ' + signupStatus + '.')
			// .catch(console.error);
		// return;
	// }
	
	// if (iid.length === 0) {
		// clearInterval(iid[0]);
		// clearInterval(iid[1]);
	// }
	
	// iid = await updateStatus();
	msg.channel.send('<@' + msg.author.id + '> signups are currently ' + signupStatus + '.')
		.catch(console.error);
	
	// if (signupStatus === 'disabled') {
		// signupInProgress = false;
		// // var id = setInterval(async () => {
			// // await signup();
			// // if (signupStatus !== 'disabled') {
				// // clearInterval(id);
			// // }
		// // }, 180000);
	// }
}

async function pingWhenSignupsEnabled(msg) {
	// await signupsEnabled();
	var channel = servers.get(msg.guild.id).channels.get(msg.channel.id);
	waiting = channel.waiting;
	if (signupStatus !== 'enabled') {
		if (waiting.includes(msg.author.id)) {
			msg.channel.send('<@' + msg.author.id + '> You\'re already on the list to be pinged!')
				.catch(console.error);
				
		} else {
			msg.channel.send('<@' + msg.author.id + '> Alright, I\'ll ping you when signups are enabled!')
				.catch(console.error);
			
			if (waiting.length > 0) {
				waiting.push(msg.author.id);
				return;
			}
			waiting.push(msg.author.id);
			signupInProgress = false;
			var id = setInterval(async () => {
				// await signup();
				if (signupStatus !== 'disabled') {
					clearInterval(id);
					var ping = '';
					for (message of waiting) { 
						ping += '<@' + message + '> ';
					}
					ping += 'Signups are now enabled!';
					msg.channel.send(ping)
						.catch(console.error);
					waiting.length = 0;
				}
			}, 20000);
		}
		
	} else msg.channel.send('<@' + msg.author.id + '> Signups are already enabled.')
		.catch(console.error);
}

async function updateStatus(signupStatus, count) {
	if (config.token) client.user.setActivity('Signups are ' + signupStatus + ', and there are ' + count + ' players online.', {type: 'PLAYING'})
		.catch(console.error);
}

async function update(user, pass) {
	count = await getOnlineUsers();
	
	var signups = (await signupsEnabled(user, pass, false, ''));
	signupStatus = signups.signupStatus;
	lastEnabled = signups.lastEnabled;
	user = signups.user;
	pass = signups.pass;
	
	updateStatus(signupStatus, count);
	
	// 'secrethitler.io. Signups are ' + signupStatus + ', and there are ' + count + ' players online.', {type: 'WATCHING'})
	// client.user.setPresence({activity: {name: 'Signups are ' + signupStatus + ', and there are ' + count + ' players online.'}, status: 'online'})
	//			.catch(console.error);
	
	iid.push(0); iid.push(0);
	
	setTimeout(() => {
		iid[0] = setInterval(async () => {
			count = await getOnlineUsers();
			updateStatus(signupStatus, count);
		}, 10000);
	}, 10000);
	
	setTimeout(() => {
		iid[1] = setInterval(async () => {
			var signups = (await signupsEnabled(user, pass, false, ''));
			signupStatus = signups.signupStatus;
			lastEnabled = signups.lastEnabled;
			user = signups.user;
			pass = signups.pass;
			updateStatus(signupStatus, count);
		}, 60000);
	}, 60000);
	
	return iid;
}