const adjectives = require('./adjectives');
const config = require('./config.json');
const Discord = require('discord.js');
const fs = require('fs');
const https = require('https');
const nouns = require('./nouns');

const client = new Discord.Client();
var count = getOnlineUsers();
var iid = [];
var logFile = fs.createWriteStream('log.log', {flags:'a'});
var signupStatus = 'enabled';
var signupInProgress = false;
var servers = new Map();
var savedUsers = fs.createWriteStream('users.log', {flags:'a'});
client.login(config.token);

client.on('ready', () => {
	log('\n', logFile);
	logWithTime('***** Logged in as ' + client.user.tag + '! *****', logFile);
	updateStatus();
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
	
	if (msg.content === 'player.count') {
		replyPlayerCount(msg);
	
	} else if (msg.content === 'sign.ups') {
		replySignupsEnabled(msg);
	
	} else if (msg.content === 'ping.me.acsu') {
		pingWhenSignupsEnabled(msg);
	}
});

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
		var data = {};
		
		var req = https.request(options, res => {
			res.on('data', chunk => {
				json += chunk;
			});
			res.on('end', () => {
				if (res.statusCode === 200) {
					try {
						data = JSON.parse(json);
						resolve({
							error: 0,
							statusCode: res.statusCode,
							data: data
						});
						
					} catch (e) {
						reject({
							error: e,
							statusCode: res.statusCode,
							data: data
						});
					}
					
				} else {
					try {
						data = JSON.parse(json);
						reject({
							error: 0,
							statusCode: res.statusCode,
							data: data
						});
						
					} catch (e) {
						reject({
							error: e,
							statusCode: res.statusCode,
							data: data
						});
					}
				}
			});
		}).on('error', function (err) {
			reject({
				error: err,
				statusCode: -1,
				data: ''
			});
		});
		req.write(encodedData);
		req.end();
	});
}

async function getOnlineUsers() {
	var options = {
		host: 'secrethitler.io',
		path: '/online-playercount',
		headers: {'User-Agent': 'request'}
	};

	try {
		let JSONPromise = await makeJSONRequest(options);
		let data = await JSONPromise;
		return data.count;
		
	} catch(e) {
		logWithTime('Something\'s wrong, please try again later', logFile);
	}
}

function logWithTime(string, file) {
	var dateTime = new Date(Date.now());
	log(dateTime.getMonth().toString().padStart(2, '0') + '/' + dateTime.getDate().toString().padStart(2, '0') + '/' + dateTime.getFullYear() + ' ' + dateTime.getHours().toString().padStart(2, '0') + ':' + dateTime.getMinutes().toString().padStart(2, '0') + ':' + dateTime.getSeconds().toString().padStart(2, '0') + '.' + dateTime.getMilliseconds().toString().padStart(3, '0') + ': ' + string, file);
}

async function signup(username, email, passwd) {
	if (signupInProgress) return;
	signupInProgress = true;
	
	var encodedData = 'username=' + username + '&password=' + passwd + '&password2=' + passwd + '&email=' + email + '&isPrivate=false&bypassKey=';
	
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
		try {
			let response = await makePOSTRequest(signupOptions, encodedData);
			signupStatus = 'enabled';
			log(username + ' : ' + passwd + '\n', savedUsers);
		} catch (e) {
			signupStatus = 'disabled';
			
			if (e.data.message === 'You can only make accounts once per day.  If you need an exception to this rule, contact the moderators on our discord channel.') signupStatus = 'enabled';
			
			logWithTime(JSON.stringify(e), logFile);
		}
	
	} catch(e) {
		signupStatus = 'disabled';
		logWithTime(JSON.stringify(e), logFile);
	}
	
	// logWithTime('Signups are ' + signupStatus, logFile);
	
	signupInProgress = false;
	return signupStatus === 'enabled';
}

async function signupsEnabled() {
	if (signupInProgress) return false;
	
	var username = nouns[Math.floor(Math.random() * nouns.length)];
	while (username.length < 6 + Math.floor(Math.random() * 7)) username = adjectives[Math.floor(Math.random() * adjectives.length)] + username;
	username = username.substring(0, 12);
	
	var passwd = nouns[Math.floor(Math.random() * nouns.length)];
	while (passwd.length < 6 + Math.floor(Math.random() * 7)) passwd = adjectives[Math.floor(Math.random() * adjectives.length)] + passwd;
	passwd = passwd.substring(0, 12);
	
	email = '';
	
	//"username=acsutest&password=redacted&password2=redacted&email=acsutest@gmail.com&isPrivate=false&bypassKey=" https://secrethitler.io/account/signup
	
	log('\n' + username + ' : ' + passwd + '\n', logFile);
	
	var encodedData = 'username=' + username + '&password=' + passwd + '&password2=' + passwd + '&email=' + email + '&isPrivate=false&bypassKey='; // JSON.stringify(data);
	
	var deleteAccountOptions = {
		host: 'secrethitler.io',
		path: '/account/delete-account',
		method: 'POST',
        headers: {
			'Content-Length': Buffer.byteLength(encodedData),
			'Content-Type': 'application/x-www-form-urlencoded' // 'application/json',
        }
	}
	
	try {
		// try {
			// await makePOSTRequest(deleteAccountOptions, encodedData);
			
		// } catch (e) {
		// }
		
		return await signup(username, email, passwd);
	
	} catch(e) {
		signupStatus = 'disabled';
		return false;
	}
}

async function replyPlayerCount(msg) {
	if (iid.length === 0) {
		clearInterval(iid[0]);
		clearInterval(iid[1]);
	}
	
	iid = await updateStatus();
	msg.reply('there are currently ' + count + ' players online.')
		.catch(console.error);
}

async function replySignupsEnabled(msg) {
	// if (signupInProgress) {
		// msg.reply('signups are currently ' + signupStatus + '.')
			// .catch(console.error);
		// return;
	// }
	
	if (iid.length === 0) {
		clearInterval(iid[0]);
		clearInterval(iid[1]);
	}
	
	iid = await updateStatus();
	msg.reply('signups are currently ' + signupStatus + '.')
		.catch(console.error);
	
	if (signupStatus === 'disabled') {
		signupInProgress = false;
		// var id = setInterval(async () => {
			// await signup();
			// if (signupStatus !== 'disabled') {
				// clearInterval(id);
			// }
		// }, 180000);
	}
}

async function pingWhenSignupsEnabled(msg) {
	await signupsEnabled();
	var channel = servers.get(msg.guild.id).channels.get(msg.channel.id);
	waiting = channel.waiting;
	if (signupStatus !== 'enabled') {
		if (waiting.includes(msg.author.id)) {
			msg.reply('you\'re already on the list to be pinged!')
				.catch(console.error);
				
		} else {
			msg.reply('alright, I\'ll ping you when signups are enabled!')
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
					var reply = '';
					for (message of waiting) { 
						reply += '<@' + message + '> ';
					}
					reply += 'signups are now enabled!';
					msg.channel.send(reply)
						.catch(console.error);
					waiting.length = 0;
				}
			}, 180000);
		}
		
	} else msg.reply('signups are already enabled.')
		.catch(console.error);
}

async function updateStatus() {
	// client.user.setPresence({activity: {name: 'Signups are ' + signupStatus + ', and there are ' + count + ' players online.'}, status: 'online'})
	//			.catch(console.error);
	
	count = await getOnlineUsers();
	signupStatus = (await signupsEnabled() ? 'enabled' : 'disabled');
	client.user.setActivity('secrethitler.io. Signups are ' + signupStatus + ', and there are ' + count + ' players online.', {type: 'WATCHING'})
		.catch(console.error);
	
	iid.push(0); iid.push(0);
	
	setTimeout(() => {
		iid[0] = setInterval(async () => {
			count = await getOnlineUsers();
			client.user.setActivity('secrethitler.io. Signups are ' + signupStatus + ', and there are ' + count + ' players online.', {type: 'WATCHING'})
				.catch(console.error);
		}, 10000);
	}, 10000);
	
	setTimeout(() => {
		iid[1] = setInterval(async () => {
			signupStatus = (await signupsEnabled() ? 'enabled' : 'disabled');
			client.user.setActivity('secrethitler.io. Signups are ' + signupStatus + ', and there are ' + count + ' players online.', {type: 'WATCHING'})
				.catch(console.error);
		}, 180000);
	}, 180000);
	return iid;
}