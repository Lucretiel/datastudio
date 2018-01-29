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

const getConfig = request => ({
	configParams: [{
		name: "org",
		displayName: "Organization",
		helpText: "The name of the organization (or user) that owns the repo",
		placeholder: "google",
	}, {
		name: "repo",
		displayName: "Repository",
		helpText: "The name of the repository you want issues from",
		placeholder: "datastudio",

	}],
})

const getAuthType = () => ({
	type: "OAUTH2"
})

const ISSUE_SCHEMA = [{
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
		conceptType: "METRIC",
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
	dataType: "BOOL",
	semantics: {
		conceptType: "METRIC",
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
		conceptType: "METRIC",
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
}]


const getSchema = request => ({
	schema: ISSUE_SCHEMA
})


const schemaForField = fieldName => ISSUE_SCHEMA.find(
	field => field.name === fieldName
)


const schemaForFields = fieldNames => fieldNames.map(schemaForField)


// Format a date in the YYYYMMDDHH format expected by datastudio. date
// should be an iso formatted datetime, or something falsey. Returns
// null if something falsey was given, or else the formatted date
const formatDate = date =>
	!date ? null :
		date.slice(0, 4) +
		date.slice(5, 7) +
		date.slice(8, 10) +
		date.slice(11, 13)

// Set of functions that retrieve a data connector value from a JSON
// blob returned by the github api. By default, a getter will just
// look at the relevant field name (so, the title value will be
// blob.title). However, if a getter is present here, it will be used.
// This allows us to do simple data transformations, like on the dates.
const fieldGetters = {
	open: issueBlob => issueBlob.state === "open",
	reporter: issueBlob => issueBlob.user.login,
	num_comments: issueBlob => issueBlob.comments,
	is_pull_request: issueBlob => issueBlob.pull_request !== undefined,
	created_at: issueBlob => formatDate(issueBlob.created_at),
	closed_at: issueBlob => formatDate(issueBlob.closed_at),
}



const getFieldFromBlob = (issueBlob, fieldName) => {
	const getter = fieldGetters[fieldName]
	return getter ? getter(issueBlob) : issueBlob[fieldName]
}


const encodeQuery = queryParams =>
	'?' + Object.entries(queryParams)
	.map(([key, value]) => `${key}=${value}`)
	.join('&')


const getData = request => {
	const { org, repo } = request.configParams
	const fieldNames = request.fields.map(field => field.name)

	const oauthClient = getOAuthService()
	const options = {
		headers: {
			"Accept": "application/vnd.github.v3.full+json",
			"Authorization": `token ${oauthClient.getAccessToken()}`
		}
	}
	const queryString = encodeQuery({
		state: 'all',
	})
	const url = `https://api.github.com/repos/${org}/${repo}/issues${queryString}`

	// May throw an exception
	const response = JSON.parse(UrlFetchApp.fetch(url, options))

	return {
		cachedData: false,
		schema: schemaForFields(fieldNames),
		rows: response.map(issueBlob => ({
			values: fieldNames.map(fieldName => (
				getFieldFromBlob(issueBlob, fieldName))
			)
		}))
	}
}


/**
 * OAUTH API
 */

const memoize = func => {
	const sentinel = {}
	let instance = sentinel
	const wrapper = () => instance === sentinel ?
		(instance = func()) : instance
	wrapper.reset = () => {
		const local = instance
		instance = sentinel
		return local
	}
	return wrapper
}

const OAUTH_CLIENT_ID = 'OAUTH_CLIENT_ID';
const OAUTH_CLIENT_SECRET = 'OAUTH_CLIENT_SECRET';


const getOAuthService = memoize(() => {
	const scriptProps = PropertiesService.getScriptProperties()
	return OAuth2.createService('github')
		.setAuthorizationBaseUrl('https://github.com/login/oauth/authorize')
		.setTokenUrl('https://github.com/login/oauth/access_token')
		.setClientId(scriptProps.getProperty(OAUTH_CLIENT_ID))
		.setClientSecret(scriptProps.getProperty(OAUTH_CLIENT_SECRET))
		.setPropertyStore(PropertiesService.getUserProperties())
		.setCallbackFunction('authCallback')
})


const authCallback = request =>
	getOAuthService().handleCallback(request) ?
		HtmlService.createHtmlOutput('Success! You can close this tab.') :
		HtmlService.createHtmlOutput('Denied. You can close this tab')


const isAuthValid = () => getOAuthService().hasAccess()

// The first reset is for memoize, which returns the underlying service.
const resetAuth = () => getOAuthService.reset().reset()

const get3PAuthorizationUrls = () => getOAuthService().getAuthorizationUrl()

const isAdminUser = () => true
