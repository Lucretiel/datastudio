"use strict";

var _slicedToArray = function () { function sliceIterator(arr, i) { var _arr = []; var _n = true; var _d = false; var _e = undefined; try { for (var _i = arr[Symbol.iterator](), _s; !(_n = (_s = _i.next()).done); _n = true) { _arr.push(_s.value); if (i && _arr.length === i) break; } } catch (err) { _d = true; _e = err; } finally { try { if (!_n && _i["return"]) _i["return"](); } finally { if (_d) throw _e; } } return _arr; } return function (arr, i) { if (Array.isArray(arr)) { return arr; } else if (Symbol.iterator in Object(arr)) { return sliceIterator(arr, i); } else { throw new TypeError("Invalid attempt to destructure non-iterable instance"); } }; }();

// Copyright 2017 Google LLC.
//
// Licensed under the Apache License, Version 2.0 (the "License"); you may not
// use this file except in compliance with the License. You may obtain a copy of
// the License at
//
//     https://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an 'AS IS' BASIS, WITHOUT
// WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied. See the
// License for the specific language governing permissions and limitations under
// the License.
//
//

/**
 * @fileoverview Community Connector for GitHub Issues. Retrieves issue
 * data for a Github repository
 */

var getConfig = function getConfig(request) {
	return {
		configParams: [{
			name: "org",
			displayName: "Organization",
			helpText: "The name of the organization (or user) that owns the repo",
			placeholder: "google"
		}, {
			name: "repo",
			displayName: "Repository",
			helpText: "The name of the repository you want issues from",
			placeholder: "datastudio"

		}]
	};
};

var getAuthType = function getAuthType() {
	return {
		type: "OAUTH2"
	};
};

var ISSUE_SCHEMA = [{
	name: "number",
	label: "Number",
	description: "The issue number",
	dataType: "NUMBER",
	semantics: {
		conceptType: "DIMENSION",
		semanticType: "NUMBER",
		semanticGroup: "ID"
	}
}, {
	name: "title",
	label: "Title",
	description: "The title of the issue",
	dataType: "STRING",
	semantics: {
		conceptType: "DIMENSION",
		semanticType: "TEXT"
	}
}, {
	name: "open",
	label: "Open",
	description: "True if the issue is open, false if closed",
	dataType: "BOOLEAN",
	semantics: {
		conceptType: "METRIC",
		semanticType: "BOOLEAN"
	}
}, {
	name: "url",
	label: "URL",
	description: "URL of the issue",
	dataType: "STRING",
	semantics: {
		conceptType: "DIMENSION",
		semanticType: "URL"
	}
}, {
	name: "reporter",
	label: "Reporter",
	description: "Username of the user who reported the issue",
	dataType: "STRING",
	semantics: {
		conceptType: "DIMENSION"
	}
}, {
	name: "locked",
	label: "Locked",
	description: "True if the issue is locked",
	dataType: "BOOL",
	semantics: {
		conceptType: "METRIC",
		semanticType: "BOOLEAN"
	}
}, {
	name: "num_comments",
	label: "Number of Comments",
	description: "Number of comments on the issue",
	dataType: "NUMBER",
	semantics: {
		conceptType: "METRIC",
		semanticType: "NUMBER",
		semanticGroup: "NUMERIC"
	}
}, {
	name: "is_pull_request",
	label: "Pull Request",
	description: "True if this issue is a Pull Request",
	dataType: "BOOLEAN",
	semantics: {
		conceptType: "METRIC",
		semanticType: "BOOLEAN"
	}
}, {
	name: "created_at",
	label: "Creation Time",
	description: "The date and time that this issue was created",
	dataType: "STRING",
	semantics: {
		semanticType: "YEAR_MONTH_DAY_HOUR",
		semanticGroup: "DATETIME"
	}
}, {
	name: "closed_at",
	label: "Close Time",
	description: "The date and time that this issue was closed",
	dataType: "STRING",
	semantics: {
		semanticType: "YEAR_MONTH_DAY_HOUR",
		semanticGroup: "DATETIME"
	}
}];

var getSchema = function getSchema(request) {
	return {
		schema: ISSUE_SCHEMA
	};
};

var schemaForField = function schemaForField(fieldName) {
	return ISSUE_SCHEMA.find(function (field) {
		return field.name === fieldName;
	});
};

var schemaForFields = function schemaForFields(fieldNames) {
	return fieldNames.map(schemaForField);
};

// Format a date in the YYYYMMDDHH format expected by datastudio. date
// should be an iso formatted datetime, or something falsey. Returns
// null if something falsey was given, or else the formatted date
var formatDate = function formatDate(date) {
	return !date ? null : date.slice(0, 4) + date.slice(5, 7) + date.slice(8, 10) + date.slice(11, 13);
};

// Set of functions that retrieve a data connector value from a JSON
// blob returned by the github api. By default, a getter will just
// look at the relevant field name (so, the title value will be
// blob.title). However, if a getter is present here, it will be used.
// This allows us to do simple data transformations, like on the dates.
var fieldGetters = {
	open: function open(issueBlob) {
		return issueBlob.state === "open";
	},
	reporter: function reporter(issueBlob) {
		return issueBlob.user.login;
	},
	num_comments: function num_comments(issueBlob) {
		return issueBlob.comments;
	},
	is_pull_request: function is_pull_request(issueBlob) {
		return issueBlob.pull_request !== undefined;
	},
	created_at: function created_at(issueBlob) {
		return formatDate(issueBlob.created_at);
	},
	closed_at: function closed_at(issueBlob) {
		return formatDate(issueBlob.closed_at);
	}
};

var getFieldFromBlob = function getFieldFromBlob(issueBlob, fieldName) {
	var getter = fieldGetters[fieldName];
	return getter ? getter(issueBlob) : issueBlob[fieldName];
};

var encodeQuery = function encodeQuery(queryParams) {
	return '?' + Object.entries(queryParams).map(function (_ref) {
		var _ref2 = _slicedToArray(_ref, 2),
		    key = _ref2[0],
		    value = _ref2[1];

		return key + "=" + value;
	}).join('&');
};

var getData = function getData(request) {
	var _request$configParams = request.configParams,
	    org = _request$configParams.org,
	    repo = _request$configParams.repo;

	var fieldNames = request.fields.map(function (field) {
		return field.name;
	});

	var oauthClient = getOAuthService();
	var options = {
		headers: {
			"Accept": "application/vnd.github.v3.full+json",
			"Authorization": "token " + oauthClient.getAccessToken()
		}
	};
	var queryString = encodeQuery({
		state: 'all'
	});
	var url = "https://api.github.com/repos/" + org + "/" + repo + "/issues" + queryString;

	// May throw an exception
	var response = JSON.parse(UrlFetchApp.fetch(url, options));

	return {
		cachedData: false,
		schema: schemaForFields(fieldNames),
		rows: response.map(function (issueBlob) {
			return {
				values: fieldNames.map(function (fieldName) {
					return getFieldFromBlob(issueBlob, fieldName);
				})
			};
		})
	};
};

/**
 * OAUTH API
 */

var memoize = function memoize(func) {
	var sentinel = {};
	var instance = sentinel;
	var wrapper = function wrapper() {
		return instance === sentinel ? instance = func() : instance;
	};
	wrapper.reset = function () {
		var local = instance;
		instance = sentinel;
		return local;
	};
	return wrapper;
};

// TODO(nathanwest): surely these should be something else?
var OAUTH_CLIENT_ID = 'OAUTH_CLIENT_ID';
var OAUTH_CLIENT_SECRET = 'OAUTH_CLIENT_SECRET';

var getOAuthService = memoize(function () {
	var scriptProps = PropertiesService.getScriptProperties();
	return OAuth2.createService('github').setAuthorizationBaseUrl('https://github.com/login/oauth/authorize').setTokenUrl('https://github.com/login/oauth/access_token').setClientId(scriptProps.getProperty(OAUTH_CLIENT_ID)).setClientSecret(scriptProps.getProperty(OAUTH_CLIENT_SECRET)).setPropertyStore(PropertiesService.getUserProperties()).setCallbackFunction('authCallback');
});

var authCallback = function authCallback(request) {
	return getOAuthService().handleCallback(request) ? HtmlService.createHtmlOutput('Success! You can close this tab.') : HtmlService.createHtmlOutput('Denied. You can close this tab');
};

var isAuthValid = function isAuthValid() {
	return getOAuthService().hasAccess();
};

// The first reset is for memoize, which returns the underlying service.
var resetAuth = function resetAuth() {
	return getOAuthService.reset().reset();
};

var get3PAuthorizationUrls = function get3PAuthorizationUrls() {
	return getOAuthService().getAuthorizationUrl();
};

var isAdminUser = function isAdminUser() {
	return true;
};

