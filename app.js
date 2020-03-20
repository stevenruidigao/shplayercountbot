const Discord = require('discord.js');
const client = new Discord.Client();
const https = require('https');
const config = require('./config.json');

client.on('ready', () => {
	console.log(`Logged in as ${client.user.tag}!`);
	updateStatus();
});

client.on('message', async msg => {
	if (msg.author.bot) return;
	if (msg.content === 'player.count') {
		replyPlayerCount(msg);
	} else if (msg.content === 'sign.ups') {
		replySignupsEnabled(msg);
	}
});

client.login(config.token);

var count = getOnlineUsers();
var signupStatus = 'enabled';
var signupInProgress = false;

async function replyPlayerCount(msg) {
	count = await getOnlineUsers();
	msg.reply('there are currently ' + count + ' players online.');
}

async function replySignupsEnabled(msg) {
	if (signupInProgress) {
		msg.reply('signups are currently ' + signupStatus);
		return;
	}
	
	var enabled = await signupsEnabled();
	signupStatus = (enabled ? 'enabled' : 'disabled');
	msg.reply('signups are currently ' + signupStatus + '.');
	
	if (!enabled) {
		var id = setInterval(async () => {
			signupInProgress = false;
			await signup();
			if (signupStatus !== 'disabled') {
				clearInterval(id);
			}
		}, 180000);
	}
}

async function updateStatus() {
	count = await getOnlineUsers();
	client.user.setPresence({activity: {name: count + ' players online.'}, status: 'online'});
	setInterval(async () => {
		count = await getOnlineUsers();
		client.user.setPresence({activity: {name: count + ' players online.'}, status: 'online'});
	}, 60000);
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
		console.log('Something\'s wrong, please try again later');
	}
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

async function signupsEnabled() {
	if (signupInProgress) return false;
	signupInProgress = true;
	
	var data = {
		username: 'acsutest',
		password: config.password,
		password2: config.password,
		email: 'acsutest@gmail.com',
		isPrivate: false,
		bypassKey: ''
	}
	//"username=acsutest&password=redacted&password2=redacted&email=acsutest@gmail.com&isPrivate=false&bypassKey=" https://secrethitler.io/account/signup

	var encodedData = 'username=acsutest&password=' + config.password + '&password2=' + config.password + '&email=acsutest@gmail.com&isPrivate=false&bypassKey='; // JSON.stringify(data);
	
	var deleteAccountOptions = {
		host: 'secrethitler.io',
		path: '/account/delete-account',
		method: 'POST',
        headers: {
			'Content-Length': Buffer.byteLength(encodedData),
			'Content-Type': 'application/x-www-form-urlencoded' // 'application/json',
        }
	}
	
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
			await makePOSTRequest(deleteAccountOptions, encodedData);
		} catch (e) {
			signupInProgress = true;
		}
		try {
			let response = await makePOSTRequest(signupOptions, encodedData);
			signupStatus = 'enabled';
			signupInProgress = false;
		} catch (e) {
			signupStatus = 'disabled';
			signupInProgress = true;
		}
		let data = (await response).data;
		return !signupInProgress;
	} catch(e) {
		signupStatus = 'disabled';
		signupInProgress = true;
		return false;
	}
}

async function signup() {
	if (signupInProgress) return;
	signupInProgress = true;
	
	console.log('signupInProgress: ' + signupInProgress);
	
	var encodedData = 'username=acsutest&password=' + config.password + '&password2=' + config.password + '&email=acsutest@gmail.com&isPrivate=false&bypassKey=';
	
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
			signupInProgress = false;
		} catch (e) {
			signupStatus = 'disabled';
			signupInProgress = true;
		}
		
		let data = response.data;
		
		return !signupInProgress;
	} catch(e) {
		signupStatus = 'disabled';
		signupInProgress = true;
		
		return !signupInProgress;
	}
}