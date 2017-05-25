var util = require('../util');
var _ = require('lodash');



exports.get = (userData, apiService, definitionService, cityResourcesService, eraService) => {
	const serviceName = 'TradeService';
	const wls = util.writeLogService(userData);

	wls.writeLog(`Tworzę usługę %s`,serviceName);

	let tradeOffersArray = null;

	const getTradeOffers = () => apiService.doServerRequest(serviceName, [], 'getTradeOffers');
	const createTradeOffer = offer => apiService.doServerRequest(serviceName, [offer], 'createOffer');
	//const acceptOffer = offer => apiService.doServerRequest(serviceName, [offer], 'acceptOffer');

	var createTradeOfferObj = function(offerName, offerCount, needName, needCount) {
		return {
			__class__ : 'TradeOffer',
			clan_only : false,
			offer_created_at : 0,
			offer : util.createCityGood(offerName, offerCount),
			id : 0,
			need : util.createCityGood(needName, needCount),
			merchant : null
		};
	};

	var getMyOffers = function(myOffers) {
		if (myOffers === undefined) {
			myOffers = true;
		}
		var getMine = to => to.merchant.player_id === userData.playerId;
		var getOthers = to => to.merchant.player_id !== userData.playerId;
		return _.filter(tradeOffersArray, myOffers ? getMine : getOthers);
	};

	var getTradeResInfo = function(tradeRes) {
		var def = definitionService.findResDefinition(tradeRes.id);
		return {
			res: tradeRes,
			def: def,
			amount: cityResourcesService.getAmount(tradeRes.id),
			isDeposit: cityResourcesService.isDeposit('raw_' + tradeRes.id),
			isProducer: cityResourcesService.isProducer('raw_' + tradeRes.id),
			eraIndex: eraService.getEraIndex(def.era)
		};
	};

	var amountTemplateTable = [5, 10, 20, 50, 100, 200, 500, 1000, 2000, 5000];

	var generateTradeOffers = function() {
		if (tradeOffersArray === null) {
			return util.getEmptyPromise({});
		}
		var myOffers = getMyOffers();
		var getAmountInTradeOffers = function(good_id) {
			return _(myOffers).filter(to => to.offer.good_id === good_id).sumBy('offer.value') || 0;
		};
		var getAmountInTradeOffersNeed = function(offerId, needId) {
			return _(myOffers).filter(to => to.offer.good_id === offerId && to.need.good_id === needId).sumBy('need.value') || 0;
		};
		//var offerArray = [];
		var generatedOffer = null;
		//writeLog(`Generowanie ofert handlowych`);
		//console.log("**********resByEra:",JSON.stringify(definitionService.getDefinitions().resByEra));
		_.each(definitionService.getDefinitions().resByEra, era => {
			if (generatedOffer) {
				return false;
			}
			//writeLog(`Przeglądam zasoby dla ery ${era.eraName}`);
			var resInfoArray = _.map(era.goods, g => getTradeResInfo(g));
			// initialize Resources Info Array for previous Era to trade resources from actual Era for previous Era with a ratio of 2 previous for 1 actual
			var resPreviousInfoArray = _.map(era.previousEraGoods, g => getTradeResInfo(g));

			// need to have both depo and resourceBuilding to trade goods isDeposit and isProducer true
			var depoArray = _.filter(resInfoArray, r => r.isDeposit && r.isProducer);
			var depoLength = depoArray.length;
			if (depoLength === 0) {
				return false;
			}
			var noDepoArray = _.filter(resInfoArray, r => !r.isDeposit || !r.isProducer);
			var noPreviousDepoArray = _.filter(resPreviousInfoArray, r => !r.isDeposit || !r.isProducer);

			_.each(resInfoArray, d => {
				d.amountWithOffers = d.amount + getAmountInTradeOffers(d.res.id);
			});
			_.each(resPreviousInfoArray, d => {
				d.amountWithOffers = d.amount + getAmountInTradeOffers(d.res.id);
			});
			//console.log("**********resInfoArray:",JSON.stringify(resInfoArray));
			//console.log("**********resPreviousInfoArray:",JSON.stringify(resPreviousInfoArray));

			var medAmount = _.meanBy(resInfoArray, 'amountWithOffers');
			var medPreviousAmount = _.meanBy(resPreviousInfoArray, 'amountWithOffers');

			_.each(depoArray, d => {
				if (generatedOffer) {
					return false;
				}
				var amountToSell = Math.round(d.amount - medAmount);
				var amountPreviousToSell = Math.round(d.amount - medPreviousAmount);
				//console.log("Trade Same Era:%s|Avg Resource All:%d|Depo Resource to trade:%s|Amount to sell:%d",d.res.era,medAmount,d.res.name,amountToSell);
				if (amountToSell >= 10) {
					//writeLog(`Jest potencjał do sprzedaży ${d.res.name}`);
					_.each(noDepoArray, nd => {
						if (generatedOffer) {
							return false;
						}
						var needAmount = getAmountInTradeOffersNeed(d.res.id, nd.res.id);
						var amountToBuy = medAmount - nd.amount - needAmount;
						var uniqTradeOffers = _(myOffers).filter(t => t.offer.good_id === d.res.id && t.need.good_id === nd.res.id).map(t => t.offer.value).map(a => Math.round(a / 10) * 10).uniq().sort().value();
						amountToBuy = _(amountTemplateTable).difference(uniqTradeOffers).filter(a => a <= amountToBuy).first();
						//console.log("Trade Era:%s|No depo Resource to buy:%s|Needed Amount:%d|Amount to Buy:%d",nd.res.era,nd.res.name,needAmount,amountToBuy);
						if (amountToBuy !== undefined) {
							wls.writeLog(`Przygotowuję ofertę zakupu %s x %s oferując %s w stosunku 1:1`,amountToBuy,nd.res.name,d.res.name);
							//console.log("CreateOffer Era:%s|Depo Resource to Sell:%s/Qty:%d for Resource to buy:%s/Qty:%d",nd.res.era,d.res.name,amountToBuy,nd.res.name,amountToBuy);
						generatedOffer = createTradeOfferObj(d.res.id, amountToBuy, nd.res.id, amountToBuy);
							return false;
						}
					});
				}
				//console.log("Trade Previous Era:%s|Avg Resource All:%d|Depo Resource to trade:%s|Amount to sell:%d",d.res.era,medPreviousAmount,d.res.name,amountPreviousToSell);
				if (amountPreviousToSell >= 5) {
					//writeLog(`Jest potencjał do sprzedaży ${d.res.name}`);
					_.each(noPreviousDepoArray, nd => {
						if (generatedOffer) {
							return false;
						}
						var needAmount = getAmountInTradeOffersNeed(d.res.id, nd.res.id);
						var amountToBuy = medPreviousAmount - nd.amount - needAmount;
						//console.log("Trade Previous Era:%s|No Depo Resource to buy:%s|Needed Amount:%d|Avg Previous Amount:%d|No Depo Amoun:%d|Amount to Buy:%d",nd.res.era,nd.res.name,needAmount,medPreviousAmount,nd.amount,amountToBuy);
						var uniqTradeOffers = _(myOffers).filter(t => t.offer.good_id === d.res.id && t.need.good_id === nd.res.id).map(t => t.offer.value).map(a => Math.round(a / 10) * 10).uniq().sort().value();
						//console.log("myOffers: %s",JSON.stringify(myOffers));
						//console.log("uniqTradeOffers: %s",JSON.stringify(uniqTradeOffers));
						amountToBuy = _(amountTemplateTable).difference(uniqTradeOffers).filter(a => a <= amountToBuy).last();
						//console.log("Trade Previous Era:%s|No Depo Resource to buy:%s|Needed Amount:%d|Amount to Buy:%d",nd.res.era,nd.res.name,needAmount,amountToBuy);
						if (amountToBuy !== undefined) {
							wls.writeLog(`Przygotowuję ofertę zakupu %s x %s oferując %s w stosunku 1:2`,amountToBuy,nd.res.name,d.res.name);
							//console.log("CreateOffer Era:%s|Depo Resource to Sell:%s/Qty:%d for Trade Previous Era:%s|RNo Depo esource to buy:%s/Qty:%d",d.res.era,d.res.name,amountToBuy,nd.res.era,nd.res.name,amountToBuy*2);
							generatedOffer = createTradeOfferObj(d.res.id, amountToBuy, nd.res.id, amountToBuy*2);
							return false;
						}
					});
				}
			});
		});
		if (generatedOffer) {
			//writeLog(`Przygotowano ${offerArray.length} ofert handlowych.`);
			return createTradeOffer(generatedOffer);
		}
		return util.getEmptyPromise({});
	};

	const refreshGuard = util.intervalPromiseGuard2(120, getTradeOffers);

	return {
		handleResponse: (rd) => {
			var handleGetTradeOffers = function(responseData) {
				tradeOffersArray = _.filter(responseData, to => to.merchant.player_id !== -1);
			};
			var handleAcceptOffer = function(responseData) {
				wls.writeLog(`Wynik akceptacji oferty handlowej: %s`,responseData);
			};
			switch (rd.requestMethod) {
			case 'getTradeOffers':
				handleGetTradeOffers(rd.responseData);
				break;
			case 'acceptOffer':
				handleAcceptOffer(rd.responseData);
				break;
			}
		},
		getServiceName: () => serviceName,
		process: () => {
			return refreshGuard.invoke().then(generateTradeOffers);
		},
		getMyOffers
	};
};
