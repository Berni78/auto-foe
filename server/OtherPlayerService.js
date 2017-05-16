var util = require('../util');
var _ = require('lodash');

var i18n = require('i18n-2');
var i18nlog = new (require('i18n-2'))({
    // setup some locales - other locales default to the first locale
    locales: ['pl', 'en'],
		directory: './locales',
		extension: '.json'
});

i18nlog.setLocale('en');

exports.get = (userData, apiService, definitionService) => {
	const serviceName = 'OtherPlayerService';
	const wls = util.writeLogService(userData);

	let neighbourList = null;
	let acceptedTrades = [];

	const findPlayer = id => _.find(neighbourList, n => n.player_id === id);

	//const invokeMethod = (methodName, params) => apiService.doServerRequest(serviceName, params, methodName);

	const refreshGuard = util.intervalPromiseGuard2(3600, () => {
		wls.writeLog('Odczytuję listę przyjaciół/sąsiadów/członków gildii...');
		neighbourList = [];
		return apiService.doApiRequestArray([
			apiService.apiHelper.createServerRequest(serviceName, [], 'getNeighborList'),
			apiService.apiHelper.createServerRequest(serviceName, [], 'getClanMemberList'),
			apiService.apiHelper.createServerRequest(serviceName, [], 'getFriendsList')
		]);
	});

	const eventsRefreshGuard = util.intervalPromiseGuard2(300, () => apiService.doServerRequest(serviceName, null, 'getEvents'));

	const calculateTimeout = () => _.each(neighbourList, n => util.calculateTimeout(n, 'next_interaction_in'));

	var motivateNeighbours = function() {
		var sysdate = (new Date()).valueOf();
		var nbList = _(neighbourList).filter(n => !n.is_self && (n.is_friend || n.is_neighbor || n.is_guild_member) && (!n.__timeout__ || n.__timeout__ < sysdate)).map(n => n.player_id).first();
		if (nbList) {
			return apiService.doServerRequestR2(serviceName, [nbList], 'polivateRandomBuilding', 'rewardPolivate').then(responseData => {
				if (responseData.r1.mapEntity) {
					var action = responseData.r1.action;
					switch (responseData.r1.action) {
					case 'motivate':
						action = i18nlog.__('Zmotywowano');
						break;
					case 'polish':
						action = i18nlog.__('Odrestaurowano');
						break;
					}
					var bDef = definitionService.findBuildingDefinition(responseData.r1.mapEntity.cityentity_id);
					var player = findPlayer(responseData.r1.mapEntity.player_id);
					var actionText = i18nlog.__(`%s budynek %s gracza %s. Nagroda:`,action,bDef.name,player.name);

					_.each(responseData.r2, r => {
						if (r.__class__ === 'CityResource') {
							if (r.money) {
								wls.writeLog(`%s %s monet.`,actionText,r.money);
							} else {
								wls.writeLog(`%s klasy CityResource.`,actionText);
							}
						} else {
							wls.writeLog(`%s klasa %s.`,actionText,r.__class__);
						}
					});
				}
			});
		}
		return util.getEmptyPromise(null);
	};

	var acceptInvitation = function() {
		var nbList = _(neighbourList).filter(n => !n.is_friend && n.incoming).slice(0, 1).value();
		if (nbList.length) {
			wls.writeLog(`Akceptowanie zaproszenia od gracza %s`,nbList[0].name);
			return apiService.doServerRequest('FriendService', [nbList[0].player_id], 'acceptInvitation');
		}
		return util.getEmptyPromise(null);
	};

	wls.writeLog(`Tworzę usługę %s`,serviceName);

	return {
		handleResponse: (rd) => {
			var handleUpdatePlayer = function(responseData) {
				_.each(responseData, neighbour => util.replaceInArray(neighbourList, 'player_id', neighbour));
			};
			var handleGetNeighborList = function(responseData) {
				_.each(responseData, r => {
					util.replaceInArray(neighbourList, 'player_id', r);
				});
			};
			var handleGetEvents = function(responseData) {
				acceptedTrades = _.filter(responseData[0], x => x.type === 'trade_accepted');
			};
			switch (rd.requestMethod) {
			case 'updatePlayer':
				handleUpdatePlayer(rd.responseData);
				break;
			case 'getNeighborList':
			case 'getClanMemberList':
			case 'getFriendsList':
				handleGetNeighborList(rd.responseData);
				break;
			case 'getEvents':
				handleGetEvents(rd.responseData);
				break;
			}
			calculateTimeout();
		},
		getServiceName: () => serviceName,
		process: () => {
			return refreshGuard.invoke()
				.then(motivateNeighbours)
				.then(acceptInvitation)
				.then(eventsRefreshGuard.invoke);
		},
		getAcceptedTrades: () => acceptedTrades,
		getNeighborList: () => neighbourList,
		getFriends: () => _.filter(neighbourList, n => n.is_friend && n.player_id !== userData.playerId),
		updatePlayers: playerList => {
			util.replaceInArray(neighbourList, 'player_id', playerList);
			calculateTimeout();
		},
		visitPlayer: playerId => apiService.doServerRequestR(serviceName, [playerId], 'visitPlayer'),
		findPlayer: findPlayer
	};
};
