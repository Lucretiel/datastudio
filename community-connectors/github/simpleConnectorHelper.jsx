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
 * var result = mapObjectSorted_(obj, function(value) { return value + 1})
 * // result == [2,3,4]
 */
const mapObjectSorted_ = (object, func) =>
	Object.keys(object).sort().map(key => func(object[key], key, object))


/**
 * Given an unkeyed schema, which is an array of schema fields, return an
 * object containing those same fields, mapped on field.name
 * @param  {!Array<Object>} schema The schema to convert into an object
 * @return {!Object<string, Object>} The same schema, keyed by field name
 */
const makeKeyedSchema = unkeyedSchema => {
	const keyedSchema = {}
	schema.forEach(field => keyedSchema[field.name] = field)
	return keyedSchema
}


/**
 * Given a connector, which has a .schema property, which should be an array
 * of schema fields, attach a getSchema() function and a keyedSchema property
 * to the connector.
 * @param  {!Object} connector The connector to be modified
 * @return {!Object}           The same connector object
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
 * @param  {{
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
 * Combine a set of partial subconnectors into a single connector interface.
 * Each partial subconnector should have its own schema and data model, but they
 * should all share the same config.
 *
 * This function returns 3 functions: getConfig, getSchema, and getData, which
 * should be exported globally in your apps script project so that the
 * community connector can use them. The getConfig function is modified to
 * return an additional "Data Type" config field, which allows the consumer
 * of the connector to select which underlying connector they want to use. For
 * example, if you're creating a G Suite connector, you could use this function
 * with subconnectors that retreive a user's emails, calendar events, contacts,
 * and so on.
 *
 * @param  {!Function} options.getConfig getConfig function, which is shared
 *   among all subconnectors. The config returned by this function is modified
 *   to include an additional configParam, which is of type SELECT_SINGLE and
 *   allows the user to select a subconnector
 *
 * @param  {Object<string, {getSchema, getData, label}>} options.connectors
 *   an object containing subconnectors to use. Each property of the
 *   subconnector should be an object with a getSchema method, a getData method,
 *   and a label. When the global connector's getSchema and getData functions
 *   are called, the request is routed to the appropriate connector, based on
 *   request.configParams. The method is called directly on the connector
 *   object, so feel free to use `this` methods in your functions.
 *
 * @return {{getSchema, getData, getConfig}} Returns the 3 primary community
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
 *       label: "Contacts",
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
const combineConnectors = ({getConfig, connectors}) => {
	const connectorOptionKey = "combineConnectors__connectorSelection"
	const connectorOptionDef = [{
		type: "SELECT_SINGLE",
		name: connectorOptionKey,
		displayName: "Data Type",
		helpText: "Select the type of data you want.",
		options: mapObjectSorted_(connectorDefs, (connector, connectorKey) => ({
			value: connectorKey, label: connector.label,
		}))
	}]

	const getFullConfig = request => {
		const userConfig = getConfig(request)
		return {
			configParams: userConfig.configParams.concat(connectorOptionDef),
			dateRangeRequired: userConfig.dateRangeRequired,
		}
	}

	const getConnector = request =>
		connectors[request.configParams[connectorOptionKey]]

	const getSchema = request => getConnector(request).getSchema(request)
	const getData = request => getConnector(request).getData(request)

	return {
		getConfig: getFullConfig,
		getSchema: getSchema,
		getData: getData
	}
}
