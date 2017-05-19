var _ = require('lodash');
var util = require('util');

var i18nlog = new (require('i18n-2'))({
    // setup some locales - other locales default to the first locale
    locales: ['en', 'fr', 'pl'],
		directory: './locales',
		extension: '.json'
});
i18nlog.setLocale('en');

var i18nFront = new (require('i18n-2'))({
    // setup some locales - other locales default to the first locale
    locales: ['en', 'fr', 'pl'],
		directory: './locales',
		extension: '.json',
    // change the cookie name from 'lang' to 'locale'
    cookieName: 'locale'

});

var handleError = function(errorList) {
	var param = [];
	param[0] = i18nlog.__(`${arguments[0]}`);
	var args = param.concat(Array.prototype.slice.call(arguments).slice(1));
	if (arguments[0]) {
		console.error(args);
	}
	if (errorList instanceof Error) {
		console.error(errorList.stack);
	} else if (typeof(errorList) === 'string') {
		console.error(errorList);
	} else {
		_.each(errorList, function(e) {
			console.log(e);
		});
	}
};

var getEmptyPromise = function(arg) {
	return Promise.resolve(arg);
};

var extractFlashVar = function($, variableName) {
	var reg = new RegExp(variableName + '\\\'\\: \\\'(.*)\\\'');
	var foundValue = null;
	$('script').each((i, s) => {
		var st = $(s).text();
		if (st) {
			var result = reg.exec(st);
			if (result && result.length > 1) {
				foundValue = result[1];
			}
		}
	});
	console.log(`extractFlashVar("%s") = "%s"`,variableName,foundValue);
	return foundValue;
};

var replaceInArray = function(arr, searchFunc, newValue) {
	if (typeof searchFunc === 'string') {
		var propName = searchFunc;
		searchFunc = function(elem) {
			return elem[propName] === newValue[propName];
		};
	}
	var index = _.indexOf(arr, _.find(arr, searchFunc));
	if (index === -1) {
		arr.push(newValue);
	} else {
		arr.splice(index, 1, newValue);
	}
};

var writeLogService = function(userData) {

	return {
		writeLog: function() {
			//arguments[0] = `${userData.username}(${userData.world}): `+arguments[0];
			arguments[0] = "%s "+arguments[0];
			var args = Array.prototype.slice.call(arguments);
			args.splice(1,0,`${userData.username}(${userData.world}): `);
			console.log.apply(null,args);
			//console.log(`${userData.username}(${userData.world}): ${msg}`);
		},
		writeErr: function() {
			//arguments[0] = `${userData.username}(${userData.world}): `+arguments[0];
			arguments[0] = "%s "+arguments[0];
			var args = Array.prototype.slice.call(arguments);
			args.splice(1,0,`${userData.username}(${userData.world}): `);
			console.error.apply(null,args);
			//console.error(`${userData.username}(${userData.world}): ${msg}`);
		}
	};
};


console.log = function () {
	var logStdout = process.stdout;
	var param = [];
	param[0] = "LOG: "+i18nlog.__(`${arguments[0]}`);
	var args = param.concat(Array.prototype.slice.call(arguments).slice(1));
	logStdout.write(util.format.apply(null, args) + '\n');
};
console.error = console.log;

var intervalPromiseGuard = function(guardObj, intervalInSeconds, callbackReturningPromise) {
	var sysdate = (new Date()).valueOf();
	if ((guardObj.lastTick || 0) + intervalInSeconds * 1000 > sysdate) {
		return getEmptyPromise({});
	}
	guardObj.lastTick = sysdate;
	return callbackReturningPromise();
};

var intervalPromiseGuard2 = function(intervalInSeconds, callbackReturningPromise) {
	let lastTick = 0;
	return {
		invoke: () => {
			var sysdate = (new Date()).valueOf();
			if (lastTick !== 0 && lastTick + intervalInSeconds * 1000 > sysdate) {
				return getEmptyPromise({});
			}
			lastTick = sysdate;
			return callbackReturningPromise();
		}
	};
};

var calculateTimeout = function(obj, propPath) {
	var sysdate = (new Date()).valueOf();
	var propValue = _.get(obj, propPath, 0);
	if (propValue && obj.__timeout__ === undefined) {
		obj.__timeout__ = sysdate + propValue * 1000;
	}
};

var getTimeout = (remainingTimeInSeconds) => {
	var sysdate = (new Date()).valueOf();
	return sysdate + remainingTimeInSeconds * 1000;
};

var getTranslation = (req,srcLg) => {
  i18nFront.setLocaleFromCookie(req);
  console.log("gesTranslation for Locale= %s",i18nFront.getLocale());
	return i18nFront.__(srcLg);
};

exports.handleError = handleError;
exports.getEmptyPromise = getEmptyPromise;
exports.extractFlashVar = extractFlashVar;
exports.replaceInArray = replaceInArray;
exports.writeLogService = writeLogService;
exports.intervalPromiseGuard = intervalPromiseGuard;
exports.intervalPromiseGuard2 = intervalPromiseGuard2;
exports.calculateTimeout = calculateTimeout;
exports.getTimeout = getTimeout;
exports.getTranslation = getTranslation;
exports.createCityGood = (good_id, value) => ({__class__ : 'CityGood', value, good_id});
