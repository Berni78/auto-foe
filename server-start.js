var moment = require('moment');
require('moment-timezone');
require('console-stamp')(console, {
	formatter: () => moment().tz('Europe/Warsaw').format('YYYY-MM-DD HH:mm:ss.SSS')
});
var path = require('path');
var express = require('express');
var app = express();
var index = require('./index');
var fs = require('fs');
var _ = require('lodash');
var compression = require('compression');
var auth = require('http-auth');
var basic = auth.basic({
    realm: "Simon Area.",
    file: __dirname + "/users.htpasswd"
});

var ip = require('ip');
var util = require('./util')
var i18n = require('i18n-2');
var cookieParser = require('cookie-parser');

var hbs = require('hbs');


// Connect with i18nize.com
//var Client = require('i18nize');
//var client = new Client('1f137193-ce6c-499a-9d29-57569ef203d3', './locales', false);
//client.getAllLocales();

// Attach the i18n property to the express request object
// And attach helper methods for use in templates

i18n.expressBind(app, {
    // setup some locales - other locales default to en silently
    locales: ['fr', 'en', 'pl'],
		directory: './locales',
		extension: '.json',
    // change the cookie name from 'lang' to 'locale'
    cookieName: 'locale'
});

hbs.registerHelper('__', function(key, context) {
  return context.data.root.__(key);
});
app.set('views', "" + __dirname + "/views");
app.engine('handlebars', hbs.__express);
app.set('view engine', 'hbs'); //sets express view engine to handlebars

//var isLocal = (process.env.OPENSHIFT_NODEJS_IP === undefined);

var server_port = process.env.OPENSHIFT_NODEJS_PORT || 3000;
//var server_ip_address = process.env.OPENSHIFT_NODEJS_IP || '127.0.0.1';
var server_ip_address = ip.address(); // my ip address
console.log(`Będę uruchamiał serwer na porcie %s, na adresie %s`,server_port,server_ip_address);

app.use(compression({
	filter: function(req, res) {
		if (req.headers['x-no-compression']) {
			return false;
		}
		return compression.filter(req, res);
	}
}));

app.use(cookieParser());

// set a cookie
app.use(function (req, res, next) {
  // check if client sent cookie
  var cookie = req.cookies.locale;
  if (cookie === undefined)
  {
    // no: set a new cookie
    //res.cookie('locale','fr', { maxAge: 900000, httpOnly: true });
		res.cookie('locale',req.acceptsLanguages('fr','en','pl'), { maxAge: 900000, httpOnly: true });
    console.log('cookie locale = %s created successfully',req.acceptsLanguages('fr','en','pl'));
  }
  else
  {
    // yes, cookie was already present
    console.log('cookie exists locale = %s', cookie);
  }
  next(); // <-- important!
});


// This is how you'd set a locale from req.cookies.
// Don't forget to set the cookie either on the client or in your Express app.
app.use(function(req, res, next) {
    req.i18n.setLocaleFromCookie();
    next();
});

app.use(auth.connect(basic));
app.use('/http', express.static('http'));
app.use('/asset', express.static('static/asset'));


app.get('/', function(req,res){
	res.render('index.hbs');  //respond with homepage
});

app.get('/js/index.js.hbs', function(req,res){
	res.setHeader('content-type', 'text/javascript');
	res.render('js/index.js.hbs');  //respond with homepage
});

/*app.use(function(req,res){  //express catch middleware if page doesn't exist
	res.status(404);  //respond with status code
	res.render('404'); //respond with 404 page
});*/


app.use('/asset', express.static('static/asset'));

app.listen(server_port, server_ip_address, function () {
	console.log(`Nasłuch na porcie %s, na adresie %s`,server_port,server_ip_address);
});
app.get('/health', (req, res) => {
	res.end();
});
/*
app.get('/', (req, res) => {
	//res.sendFile(path.join(__dirname, './http/index.html'));
	var template = swig.compileFile('./http/index.html');
	var output = template({
		title: req.i18n.__("Panel sterowania automatem do gry Forge of Empires"),
		desc: req.i18n.__("My Site Description")
});
console.log("*****************************Rendering html template");
res.sendFile(output);
});
*/

var userSettings = JSON.parse(fs.readFileSync('./userdata/settings.json', 'utf8'));
//var userData = userSettings.accounts[0];
//var gameHelper = index.get(userData);
_.each(userSettings.accounts, a => {
	a.gameHelper = index.get(a);
	a.gameHelper.startAccount();
});

app.get('/ctrl/getAccountList', (req, res) => {
	console.log("GetAccount");
	res.json(_.map(userSettings.accounts, a => {
		return {
			username: a.username,
			world: a.world,
			worldName: a.worldName,
			eraName: util.getTranslation(req,a.eraName)
		};
	}));
});

app.get('/ctrl/*', (req, res) => {
	var methodName = req.params[0];
	if (methodName) {
		console.log(`%s(%s): wywołano metodę %s`,req.query.username,req.query.world,methodName);
		var foundAccount = _.find(userSettings.accounts, a => a.username === req.query.username && a.world === req.query.world);
		if (foundAccount) {
			var method = foundAccount.gameHelper[methodName];
			method(req.query).then(result => {
				res.json(result);
			});
		}
	}
});
