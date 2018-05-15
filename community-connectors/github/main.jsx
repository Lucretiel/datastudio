"use strict";

/**
 * @license
 * Copyright 2018 Google LLC.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you
 * may not use this file except in compliance with the License. You may
 * obtain a copy of the License at
 *
 *      https://www.apache.org/licenses/LICENSE-2.0*
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an 'AS IS' BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or
 * implied. See the License for the specific language governing
 * permissions and limitations under the License.
 */

 /**
  * HELPERS: THESE FUNCTIONS ARE GENERAL PURPOSE HELPERS FOR THE REST
  * OF THE COMMUNITY CONNECTORS
  */

//TODO(nathanwest): Roll this stuff into a separate library

/**
 * Similar to Array.map, but for an object. Maps the value of each property to
 * an array, in sorted order by property name.
 * @param  {!Object<string, T>} object The object to map over
 * @param  {!function(string, T, Object<string, T>): U} func The mapping
 *   function. Called once with (property value, property name, object) for
 *   each of the object properties, as returned by Object.keys
 * @return {!Array<U>} The mapped array with the return values of func.
 * @template T, U
 * @example
 * var obj = {c: 3, b: 2, a: 1}
 * var result = mapObjectSorted(obj, function(value) { return value + 1})
 * // result == [2,3,4]
 */
const mapObjectSorted = (object, func) =>
	Object.keys(object).sort().map(key => func(object[key], key, object))


/**
 * Given an unkeyed schema, which is an array of schema fields, return an
 * object containing those same fields, mapped on field.name
 * @param  {!Array<Object>} schema The schema to convert into an object
 * @return {!Object<string, Object>} The same schema, keyed by field name
 */
const makeKeyedSchema = unkeyedSchema => {
	const keyedSchema = {}
	schema.forEach(field => { keyedSchema[field.name] = field })
	return keyedSchema
}


/**
 * Given a connector, which has a .schema property, which should be an array
 * of schema fields, attach a getSchema() function and a keyedSchema property
 * to the connector. getSchema is a function returning a schema, per the
 * community connector spec. keyedSchema is an object containing all the
 * schema fields, keyed on field.name.
 *
 * @param  {!Object} connector The connector to be modified
 * @return {!Object} The same connector object, with a getSchema() and
 *   keyedSchema attached
 */
const applyGetSchema = connector => {
	const unkeyedSchema = connector.schema
	const keyedSchema = makeKeyedSchema(unkeyedSchema)
	const schema = { schema: unkeyedSchema }

	connector.getSchema = () => schema
	connector.keyedSchema = keyedSchema

	return connector
}

/**
 * Given a static config, create a function returning that config. The static
 * config can be either an object with "configParams" and (optionally)
 * "dateRangeRequired", or an array. If it is an array it will be treated as
 * the configParams by the returned getConfig
 * @param  {!{
 *   configParams: Array<Object>,
 *   dateRangeRequired: boolean
 * } | Array<Object>} config The static config object to use. If it is an
 *   object, the object will be returned directly by getConfig. If it is an
 *   array, getConfig will return { configParams: <config> }
 * @return {function(): {configParams, dateRangeRequired}} A function suitible
 *   for use as getConfig.
 */
const makeGetConfig = config => {
	const normalizedConfig = config instanceof Array ?
		{configParams: config, dateRangeRequired: false} :
		config

	return () => normalizedConfig
}


/**
 * Given an object used as a key-value store, encode the keys and values in
 * the object to a URL query string. If no values are given, returns an empty
 * string; otherwise returns a query string with "?" prepended. The keys and
 * values are correctly URL escaped.
 *
 * @param  {Object<String, String>} queryParams The parameters to encode. Can
 *   also be falsey, in which case an empty query string is returned
 * @return {!String} The encoded query string. Has '?' prepended, unless no
 *   fields were given, in which case it returns an empty query string.
 */
const encodeQuery = queryParams => {
	if(!queryParams)
		return ""

	const query = Object.keys(queryParams).map(key =>
		`${encodeURIComponent(key)}=${encodeURIComponent(queryParams[key])}`
	).join('&')

	return query === "" ? "" : `?${query}`
}

/**
 * Format a date in the YYYYMMDDHH format expected by datastudio. Pays no
 * attention to time zones.
 *
 * @param  {!String|Date} date An iso-8601 formatted timestamp, or a Date
 *   object, or something falsey
 * @return {[type]} The date formatted as YYYYMMDDHH, or null if something
 *   falsey was given.
 */
const formatDate = date =>
	!date ? null :
	date instanceof Date ? formatDate(date.toISOString()) :
	date.slice(0, 4) + date.slice(5, 7) + date.slice(8, 10) + date.slice(11, 13)

/**
 * An exception type that will be seen by all users. See
 * https://developers.google.com/datastudio/connector/error-handling#non-admin-messages
 * for details.
 */
const UserError = message => new Error(`DS_USER:${message}`)


/**
 * Ensure that a subconnector has all the required methods and properties
 * required for use in combineConnectors. Checks that it has getData, getSchema,
 * and a label property. Also checks that it *doesn't* have a getConfig
 * property, as getConfig is handled by combineConnectors, not the individual
 * subconnectors.
 *
 * @param {Object} subconnector the subconnector to validate
 * @throws {Error} If the subconnector fails validation, an Error is thrown.
 */
const validateSubconnector = subconnector => {
	if(!subconnector)
		throw new Error("You provided a falsey connector")

	if(!(subconnector.getData instanceof Function))
		throw new Error("subconnector requires .getData()")

	if(!(subconnector.getSchema instanceof Function))
		throw new Error("subconnector requires .getSchema()")

	if(! typeof subconnector.getSchema === 'string')
		throw new Error("subconnector requires a .label")

	if(subconnector.getConfig instanceof Function)
		throw new Error("subconnector should NOT have .getConfig(); this is handled by combineConnectors")
}


/**
 * Combine a set of partial subconnectors into a single connector interface.
 * Each partial subconnector should have its own schema and data model, but they
 * should all share the same config.
 *
 * This function returns an object with 3 functions: getConfig, getSchema, and
 * getData, which should be exported globally in your apps script project so
 * that the community connector can use them. The getConfig function is modified
 * to return an additional "Data Type" config field, which allows the consumer
 * of the connector to select which underlying connector they want to use. For
 * example, if you're creating a G Suite connector, you could use this function
 * with subconnectors that retreive a user's emails, calendar events, contacts,
 * and so on, with a single getConfig that specifies the user to examine.
 *
 * @param  {!Function} options.getConfig getConfig function, which is shared
 *   among all subconnectors.
 *
 * @param  {!Object<string, {getSchema, getData, label}>} options.connectors
 *   an object containing subconnectors to use. Each property of the
 *   connectors argument should be an object with a getSchema method, a getData
 *   method, and a label. When the global connector's getSchema and getData
 *   functions are called, the request is routed to the appropriate connector,
 *   based on request.configParams. The method is called directly on the
 *   connector object, so feel free to use `this` methods in your functions.
 *
 * @param {!Function} options.validateConfig if given, this function will be
 *   used to validate incoming configs from the user. It will be called before
 *   getSchema and getData with request.configParams. It should throw an
 *   exception on validation errors.
 *
 * @return {!{getSchema, getData, getConfig}} Returns the 3 primary community
 *   connector methods, which can be set directly in your global namespace to
 *   export them to the Apps Script community connector interface.
 *
 * @example
 *
 * gsuiteConnector = combineConnectors({
 *   getConfig(request) {
 *     // Configuration parameters to specify a single G Suite user
 *   }
 *   connectors: {
 *     gmails: {
 *     	label: "Gmail threads"
 *     	getSchema(request) {
 *     	  // Schema for gmail
 *     	}
 *     	getData(request) {
 *     	  // Data for gmail
 *     	}
 *     }
 *     contacts: {
 *       getSchema(request) {
 *         // Schema for contacts
 *       }
 *       getData(request) {
 *         // Data for contacts
 *       }
 *     }
 *   }
 * })
 *
 * // Set the functions globally so that Apps Script is aware of them
 * var getConfig = gsuiteConnector.getConfig
 * var getSchema = gsuiteConnector.getSchema
 * var getData = gsuiteConnector.getData
 */
const combineConnectors = ({getConfig, connectors, validateConfig}) => {
	for(connectorKey in connectors) {
		try {
			validateSubconnector(connectors[connectorKey])
		} catch(e) {
			throw new Error(`problem with subconnector ${connectorKey}: ${e.message}`)
		}
	}

	const connectorOptionKey = "combineConnectors__connectorSelection"
	const connectorOptionDef = {
		type: "SELECT_SINGLE",
		name: connectorOptionKey,
		displayName: "Data Type",
		helpText: "Select the type of data you want.",
		options: mapObjectSorted(connectorDefs, (connector, connectorKey) => ({
			value: connectorKey,
			label: connector.label,
		}))
	}

	const getFullConfig = request => {
		const userConfig = getConfig(request)
		return {
			configParams: userConfig.configParams.concat([connectorOptionDef]),
			dateRangeRequired: userConfig.dateRangeRequired,
		}
	}

	const getConnector = request =>
		connectors[request.configParams[connectorOptionKey]]

	const validateFullConfig = configParams => {
		if(validateConfig)
			validateConfig(configParams)

		if(!connectors[configParams[connectorOptionKey]]) {
			throw new UserError(
				`Invalid Connector selected: ${configParams[connectorOptionKey]}`
			)
		}
	}

	const getSchema = request => {
		validateFullConfig(request)
		return getConnector(request).getSchema(request)
	}

	const getData = request => {
		validateFullConfig(request)
		return getConnector(request).getData(request)
	}

	return {
		getConfig: getFullConfig,
		getSchema: getSchema,
		getData: getData
	}
}

/**
 * GITHUB-SPECIFIC UTILITY STUFF
 */

/**
 * Create a full, safely encoded URL for a specific github repository API call.
 * Effectively returns:
 *
 * https://api.github.com/repos/{organization}/{repository}/{endpoint}?{query}
 *
 * Each of the components are escaped with encodeURIComponent. In addition, the
 * query should be a key-value object containing query parameters, which are
 * encoded with encodeQuery.
 *
 * @param  {!string} options.organization The organization to query
 * @param  {!string} options.repository   The repository to query
 * @param  {!string} options.endpoint     The API endpoint to call
 * @param  {Object<string, string>} options.query optionally, the query
 *   parameters to append to the URL, in the form of key-value object.
 * @return {string} The complete github API URL
 */
const githubRepoApiUrl = ({organization, repository, endpoint, query}) => {
	const path = encodeURIComponent(
		[organization, repository, endpoint]
		.map(encodeURIComponent)
		.join("/")
	)

	return `https://api.github.com/repos/${path}${encodeQuery(query)}`
}

/**
 * GITHUB ISSUES CONNECTOR
 */

const githubIssuesConnector = applyGetSchema({
	label: "Issues",
	schema: [
		{
			name: "number",
			label: "Number",
			description: "The issue number",
			dataType: "NUMBER",
			semantics: {
				conceptType: "DIMENSION",
				semanticType: "NUMBER",
				semanticGroup: "ID",
			},
		}, {
			name: "title",
			label: "Title",
			description: "The title of the issue",
			dataType: "STRING",
			semantics: {
				conceptType: "DIMENSION",
				semanticType: "TEXT"
			},
		}, {
			name: "open",
			label: "Open",
			description: "True if the issue is open, false if closed",
			dataType: "BOOLEAN",
			semantics: {
				conceptType: "DIMENSION",
				semanticType: "BOOLEAN",
			},
		}, {
			name: "url",
			label: "URL",
			description: "URL of the issue",
			dataType: "STRING",
			semantics: {
				conceptType: "DIMENSION",
				semanticType: "URL",
			},
		}, {
			name: "reporter",
			label: "Reporter",
			description: "Username of the user who reported the issue",
			dataType: "STRING",
			semantics: {
				conceptType: "DIMENSION",
			},
		}, {
			name: "locked",
			label: "Locked",
			description: "True if the issue is locked",
			dataType: "BOOLEAN",
			semantics: {
				conceptType: "DIMENSION",
				semanticType: "BOOLEAN",
			},
		}, {
			name: "num_comments",
			label: "Number of Comments",
			description: "Number of comments on the issue",
			dataType: "NUMBER",
			semantics: {
				conceptType: "METRIC",
				semanticType: "NUMBER",
				semanticGroup: "NUMERIC"
			},
		}, {
			name: "is_pull_request",
			label: "Pull Request",
			description: "True if this issue is a Pull Request",
			dataType: "BOOLEAN",
			semantics: {
				conceptType: "DIMENSION",
				semanticType: "BOOLEAN",
			},
		}, {
			name: "created_at",
			label: "Creation Time",
			description: "The date and time that this issue was created",
			dataType: "STRING",
			semantics: {
				semanticType: "YEAR_MONTH_DAY_HOUR",
				semanticGroup: "DATETIME",
			},
		}, {
			name: "closed_at",
			label: "Close Time",
			description: "The date and time that this issue was closed",
			dataType: "STRING",
			semantics: {
				semanticType: "YEAR_MONTH_DAY_HOUR",
				semanticGroup: "DATETIME",
			},
		}
	],

	getData(request) {
		const { organization, repository } = request.configParams
		const fieldNames = request.fields.map(field => field.name)

		const oauthClient = getOAuthService()
		const options = {
			headers: {
				"Accept": "application/vnd.github.v3.full+json",
				"Authorization": `token ${getOAuthService().getAccessToken()}`
			}
		}

		const url = githubRepoApiUrl({
			organization: organization,
			repository: repository,
			endpoint: "issues",
			query: {
				state: "all",
			},
		})

		// May throw an exception
		const response = JSON.parse(UrlFetchApp.fetch(url, options))

		return {
			cachedData: false,
			schema: fieldNames.map(fieldName => this.keyedSchema[fieldName]),
			rows: response.map(issueBlob => ({
				values: fieldNames.map(fieldName => (
					this.getFieldFromBlob(issueBlob, fieldName))
				)
			}))
		}
	},

	fieldGetters: {
		open: issueBlob => issueBlob.state === "open",
		reporter: issueBlob => issueBlob.user.login,
		num_comments: issueBlob => issueBlob.comments,
		is_pull_request: issueBlob => issueBlob.pull_request !== undefined,
		created_at: issueBlob => formatDate(issueBlob.created_at),
		closed_at: issueBlob => formatDate(issueBlob.closed_at),
	},

	getFieldFromBlob(issueBlob, fieldName) {
		const getter = this.fieldGetters[fieldName]
		return getter ? getter(issueBlob) : issueBlob[fieldName]
	}
})

/**
 * GITHUB STARS CONNECTOR
 */

const githubStarsConnector = applyGetSchema({
	label: "Stars",
	schema: [
		{
			name: 'starred_at',
			label: 'Starred At',
			dataType: 'STRING',
			semantics: {conceptType: 'DIMENSION'}
		}, {
			name: 'stars',
			label: 'Stars',
			dataType: 'NUMBER',
			semantics: {conceptType: 'METRIC'}
		}
	],

	sampleData: [{
		"starred_at": "2017-05-31-T12:50:00Z",
	}],

	/** @const */
	STARRED_AT: 'starred_at',

	/** @const */
	LINK_KEY: 'Link',


	/**
	 * Builds a parameterized url.
	 *
	 * @param {int} pageNumber - The page of data you are requesting.
	 * @param {string} organization - The GitHub organization the repository is under.
	 * @param {string} repository - The repository you are getting star data for.
	 *
	 * @returns {string} A url for requesting star data.
	 */
	paginatedUrl(pageNumber, organization, repository) {
		return githubRepoApiUrl({
			organization: organization,
			repository: repository,
			endpoint: "stargazers",
			query: {
				page: pageNumber,
				per_page: 100,
			}
		})
	},

	/**
	 * Fetches the response based on requested page number.
	 *
	 * @param {object} request - The request passed to `this.getData(request)`.
	 * @param {int} pageNumber - The page number you would like to fetch.
	 *
	 * @returns {object} the response from the `UrlFetchApp.fetch()`.
	 */
	fetchURL(request, pageNumber) {
		var organization = request.configParams.organization;
		var repository = request.configParams.repository;
		var options = {
			headers: {
				'Accept': 'application/vnd.github.v3.star+json',
				'Authorization': 'token ' + getOAuthService().getAccessToken()
			}
		};
		var url = this.paginatedUrl(pageNumber, organization, repository);
		var response;
		try {
			response = UrlFetchApp.fetch(url, options);
		} catch (e) {
			throw new UserError("Unable to fetch data from source.")
		}
		return response;
	},

	/**
	 * Returns the total number of pages that need to be requested.
	 *
	 * @param {object} initialResponse - The response from the first api call.
	 *
	 * @returns {int} Total number of pages.
	 */
	numberOfPages(initialResponse) {
		var headers = initialResponse.getAllHeaders();
		if (this.LINK_KEY in headers) {
			var link = headers[this.LINK_KEY];
			var lastPageRegEx = /\?page=([0-9]+)&per_page=[0-9]+>; rel="last"/;
			var matches = link.match(lastPageRegEx);
			var lastPageStr = matches[1];
			var pages = parseInt(lastPageStr, 10);
			return pages;
		} else {
			return 1;
		}
	},

	/**
	 * Returns a dynamic schema that only contains fields that were in the request.
	 *
	 * @param {object} request - The request passed to `this.getData(request)`.
	 *
	 * @returns {obj} The schema keyed by `schemaEntry.name`.
	 */
	getDataSchema(request) {
		// this.keyedSchema is created by applyGetSchema
		return request.fields.map(field => this.keyedSchema[field.name])
	},

	/**
	 * Transforms the star data into rows appropriate for Data Studio.
	 *
	 * @param {obj} stars - The starData built from the requests.
	 * @param {obj} dataSchema - The dynamic schema that contains the correct fields.
	 *
	 * @returns {array} Array of objects formatted for data studio use.
	 */
	rowifyStarData(stars, dataSchema) {
		return stars.map(function(starData) {
			var values = [];
			// Build a row that includes each schema field
			dataSchema.forEach(function(field) {
				switch (field.name) {
					case 'stars':
						return values.push(1);
					case 'starred_at':
						return values.push(starData[this.STARRED_AT]);
					default:
						return values.push('');
				}
			});
			// Individual row format.
			// { values: ["017-10-13T11:52:44Z", 1]}
			return {values: values};
		});
	},

	getData(request) {
		var stars = [];
		if (request.scriptParams && request.scriptParams.sampleExtraction === true) {
			stars = this.sampleData;
		} else {
			var initialResponse = this.fetchURL(request, 1);
			var totalPages = this.numberOfPages(initialResponse);
			for (var i = 1; i <= totalPages; i++) {
				// Intentionally makes an extra request to avoid special casing the first
				// vs subsequent requests
				var currentResponse = this.fetchURL(request, i);
				try {
					var currentStarData = JSON.parse(currentResponse);
				} catch (e) {
					throw new UserError("Unable to parse data fetched from source.")
				}
				stars = stars.concat(currentStarData);
			}
		}
		var dataSchema = this.getDataSchema(request);
		var rows = this.rowifyStarData(stars, dataSchema);
		var result = {schema: dataSchema, rows: rows};

		return result;
	},
})

/**
 * MERGED CONNECTOR
 */

const githubConnector = combineConnectors({
	getConfig: makeGetConfig([
		{
			name: "organization",
			displayName: "Organization",
			helpText: "The name of the organization (or user) that owns the repository",
			placeholder: "google",
		}, {
			name: "repository",
			displayName: "Repository",
			helpText: "The name of the repository you want issues from",
			placeholder: "datastudio",
		},
	]),

	validateConfig(configParams) {
		configParams = configParams || {};

		if(!configParams.organization)
			throw new UserError("You must provide an Organization.")

		if(!configParams.repository)
			throw new UserError("You must provide a Repository.")
	},

	connectors: {
		issues: githubIssuesConnector,
		stars: githubStarsConnector,
	},
})

const getConfig = githubConnector.getConfig
const getSchema = githubConnector.getSchema
const getData = githubConnector.getData

/**
 * AUTH STUFF
 */

const getAuthType = () => ({
	type: "OAUTH2"
})

const getOAuthService = singleton(() => {
	const scriptProps = PropertiesService.getScriptProperties()
	return OAuth2.createService('github')
		.setAuthorizationBaseUrl('https://github.com/login/oauth/authorize')
		.setTokenUrl('https://github.com/login/oauth/access_token')
		.setClientId(scriptProps.getProperty('OAUTH_CLIENT_ID'))
		.setClientSecret(scriptProps.getProperty('OAUTH_CLIENT_SECRET'))
		.setPropertyStore(PropertiesService.getUserProperties())
		.setCallbackFunction('authCallback')
})


const authCallback = request =>
	getOAuthService().handleCallback(request) ?
		HtmlService.createHtmlOutput('Success! You can close this tab.') :
		HtmlService.createHtmlOutput('Denied. You can close this tab')


const isAuthValid = () => getOAuthService().hasAccess()

// The first reset is for singleton, which returns the underlying service.
const resetAuth = () => getOAuthService.reset().reset()

const get3PAuthorizationUrls = () => getOAuthService().getAuthorizationUrl()

const isAdminUser = () => false
