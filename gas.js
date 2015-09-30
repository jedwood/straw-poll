// PUBNUB CONFIG
var PUB_KEY = 'pub-c-KEY-HERE';
var SUB_KEY = 'sub-c-KEY-HERE';
var CHANNEL = 'channel_name';

function pingPubNub(req) {
  var msg = req.parameter.text;
  var url = 'http://pubsub.pubnub.com/publish/' + PUB_KEY + '/' + SUB_KEY + '/0/' + CHANNEL + '/0/' + escape('"' + msg + '"');
  var response = UrlFetchApp.fetch(url);
}

//////////////////////////////////////////////////////    TRIGGERS AND STUFF

function setMeUp(e) {
  displayAPIEndpoint();
}

function displayAPIEndpoint() {
  var scriptProperties = PropertiesService.getScriptProperties();
  scriptProperties.setProperty('ssid', SpreadsheetApp.getActiveSpreadsheet().getId());
  var ep = ScriptApp.getService().getUrl();
  Browser.msgBox("Your API Endpoint: " + ep);
}

//////////////////////////////////////////////////////    RESTful API STUFF

function doGet(req) {

  if (req.parameter._method && req.parameter._method.toLowerCase() == "post") return lePost(req);

  var sheet = getSheet(req);
  var returnData = {success: true};  // optimism FTW

  var offset = req.parameter.offset ? parseInt(req.parameter.offset) : 0;
  var limit = req.parameter.limit ? parseInt(req.parameter.limit) : 30;
  limit = Math.min(100, limit);

  var metaObj = {total_results:0, limit:limit, offset: offset};

  var results = getRowsData(sheet);
  metaObj.total_results = results.length;
  var limited = results.slice(offset, offset+limit);

  var strippedQueryString = '';
  if (req.queryString) strippedQueryString = req.queryString.replace(/(limit|offset)=[0-9]*&?/g, '').replace(/&$/, '');

  if (offset + limit < metaObj.total_results) {
    metaObj.next = '?' + strippedQueryString + '&limit=' + limit + '&offset=' + (offset + limit);
  }
  if (offset > 0) {
    metaObj.prev = '?' + strippedQueryString + '&limit=' + limit + '&offset=' + (Math.max(offset - limit, 0));
  }

  returnData.results = limited
  returnData.meta = metaObj;

  return sendResponse(req, returnData)
}


function doPost(req) {
  // do the actual POST commands in this separate function, to allow using GET with "_method" parameter to point to the same function
  return lePost(req);
}


function lePost(req) {

  // If your entry requires a simple date stamp:
  // simpleDate(new Date(req.parameter.date));

  //if you need a unique id
  //req.parameter.id = Utils.uuid(10);

  var saveObj = {
    text      : req.parameter.text,
    id        : req.parameter.messageId,
    timestamp : req.parameter['message-timestamp'],
    from      : req.parameter.msisdn
  }

  pingPubNub(req);

  // make sure we've already got this person in the directory
  var directorySheet = SpreadsheetApp.openById(getId()).getSheetByName('directory');
  var person = findRow(directorySheet, {phone: saveObj.from});
  if (person == false) {
    saveToSpreadsheet(directorySheet, {phone: saveObj.from, name: saveObj.text});
  } else {
    var answersSheet = getSheet(req);
    saveToSpreadsheet(answersSheet, saveObj);
  }
  var returnData = {success: true};
  return sendResponse(req, returnData);
}

//////////////////////////////////////////////////////    HELPERS

/**
* send off the final response
* @param {req} the HTTP request object
* @param {returnData} the object to send
*
*/
function sendResponse(req, returnData) {
  //if you want a quick send-to-email kind of debugging:
  if (req.parameter.callback) { //JSONP
    return ContentService.createTextOutput(req.parameter.callback + '(' + JSON.stringify(returnData) + ')' ).setMimeType(ContentService.MimeType.JAVASCRIPT);
  } else {
    return ContentService.createTextOutput(JSON.stringify(returnData)).setMimeType(ContentService.MimeType.JSON);
  }
}


/**
* @param {req} the HTTP request object
*
*/
function getSheet(req) {
  var sheet;
  if (req.parameter.sheet) {
    sheet = SpreadsheetApp.openById(getId()).getSheetByName(req.parameter.sheet);
  } else {
    sheet = SpreadsheetApp.openById(getId()).getSheets()[0];
  }
  return sheet;
}

/**
* Iterates row by row in the input range and returns an array of objects. Each object contains all the data for a given row, indexed by its normalized column name.
*
* @param {sheet} the sheet object that contains the data to be processed
* @param {nestedProps} use dot notation as nested properties
* @param {integer} (optional): 1-based (NOT zero-based) specifies the row number where the column names are stored, defaults to first row.
* @return {array} array of objects
*/
function getRowsData(sheet, nestedProps, columnHeadersRowIndex) {
  columnHeadersRowIndex = columnHeadersRowIndex || 1;
  nestedProps = (nestedProps === false) ? false : true;
  var range = sheet.getDataRange();
  var numColumns = range.getLastColumn() - range.getColumn() + 1;
  var headersRange = sheet.getRange(columnHeadersRowIndex, range.getColumn(), 1, numColumns);
  var headers = headersRange.getValues()[0];
  var dataRange = range.getValues();
  dataRange.splice(0, columnHeadersRowIndex);
  return getObjects(dataRange, normalizeHeaders(headers), nestedProps);
}

/**
* Gets a single row based on index.
*
* @param {sheet} the sheet object that contains the data to be processed
* @param {object} one or more key:val pairs to match on
* @return {object} matched row as an object
*/
function getRowByIndex(sheet, ind, nestedProps, columnHeadersRowIndex) {
  columnHeadersRowIndex = columnHeadersRowIndex || 1;
  nestedProps = (nestedProps === false) ? false : true;
  var range = sheet.getDataRange();
  var numColumns = range.getLastColumn() - range.getColumn() + 1;
  var headersRange = sheet.getRange(columnHeadersRowIndex, range.getColumn(), 1, numColumns);
  var headers = headersRange.getValues()[0];
  //Now we have the info we need to get the range for just a single row and make an object
  var singleRowRange = sheet.getRange(ind,range.getColumn(),1,range.getLastColumn());
  var dataRange = singleRowRange.getValues();
  return getObjects(dataRange, normalizeHeaders(headers), nestedProps)[0];
}

/**
* Finds a single row based on matching field(s).
*
* @param {sheet} the sheet object that contains the data to be processed
* @param {object} one or more key:val pairs to match on
* @return {object} matched row as an object
*/
function findRow(sheet, matchingObj) {
  var allRows = getRowsData(sheet, false);
  var numRows = allRows.length;
  for (var i=0; i<numRows; i++) {
    var leRow = allRows[i];
    var isMatch = true;
    for (var prop in matchingObj) {
      if (leRow[prop] != matchingObj[prop]) {
        isMatch = false;
        break;
      };
    }
    if (isMatch) {
      // plus 1 because rows are 1-based, another plus one because getRowsData assumes a header row
      return {index: i+2, data: leRow};
    }
  }
  return false;
}

/**
* Takes an object and saves it to spreadsheet matching up column headers with object properties
* @param {sheet}
* @param {object}
*/
function objectToRow(sheet,record) {
  var headersRange = sheet.getRange(1, 1, 1, sheet.getMaxColumns());
  var headers = normalizeHeaders(headersRange.getValues()[0]);
  var values = [];
  for (j = 0; j < headers.length; ++j) {
    var header = headers[j];
    var objVal;
    var headerBits = header.split('.');
    var evalable = "record";

    for (var h=0; h<headerBits.length; h++) {
      evalable+= '["' + headerBits[h] + '"]';
      objVal = eval(evalable);
      if (typeof objVal === "undefined") {
        break;
      }
    }

    // If the header is empty or the object value is empty...
    if ( (!header.length > 0) || typeof objVal === 'undefined' || objVal == '' ) {
      values.push('');
    }
    else {
      values.push(objVal);
    }
  }
  return values;
}

/**
* Takes an object and saves it to spreadsheet matching up column headers with object properties
* @param {sheet}
* @param {object}
*/
function saveToSpreadsheet(sheet,record) {
  var headersRange = sheet.getRange(1, 1, 1, sheet.getMaxColumns());
  var headers = normalizeHeaders(headersRange.getValues()[0]);
  var values = [];
  for (j = 0; j < headers.length; ++j) {
    var header = headers[j];
    var objVal;
    var headerBits = header.split('.');
    var evalable = "record";

    for (var h=0; h<headerBits.length; h++) {
      evalable+= '["' + headerBits[h] + '"]';
      objVal = eval(evalable);
      if (typeof objVal === "undefined") {
        break;
      }
    }

    // If the header is empty or the object value is empty...
    if ( (!header.length > 0) || typeof objVal === 'undefined' || objVal == '' ) {
      values.push('');
    }
    else {
      values.push(objVal);
    }
  }
  sheet.appendRow(values);
}

/**
* For every row of data in data, generates an object that contains the data. Names of object fields are defined in keys.
*
* @param {array} JavaScript 2d array
* @param {array} array of strings that define the property names for the objects to create
* @return {array} array of objects
*/
function getObjects(data, keys, nestedProps) {
  var objects = [];
  // each row
  for (var i = 0; i < data.length; ++i) {
    var obj = {};
    var hasData = false;
    // each column
    for (var j = 0; j < data[i].length; ++j) {
      var cellData = data[i][j];
      if (isCellEmpty(cellData)) {
        cellData = null;
      } else {
        hasData = true;
      }
      if (nestedProps) {
        var keyBits = keys[j].split('.');

        var finalProp = keyBits.pop();
        var evalable = "obj";
        for (var h=0; h<keyBits.length; h++) {
          evalable+= "['" + keyBits[h] + "']";
          var checkDef = eval(evalable);
          if (typeof checkDef === "undefined") {
            eval(evalable + " = {}");
          }
        }
        if (typeof cellData === "string") {
          cellData = cellData.replace(/\\/g,'\\\\').replace(/'/g,"\\'").replace(/\r?\n/g, "\\n");
          evalable+= "['" + finalProp + "'] = '" + cellData + "'";
        } else if (typeof cellData === "object") {
          evalable+= "['" + finalProp + "'] = " + JSON.stringify(cellData);
        } else {
          evalable+= "['" + finalProp + "'] = " + cellData;
        }
        eval(evalable);
      } else {
        obj[keys[j]] = cellData;
      }
    }

    if (hasData) {
      objects.push(obj);
    }
  }
  return objects;
}

/**
* @param {array} array of strings to normalize
* @return {array} array of normalized strings
*/
function normalizeHeaders(headers) {
  var keys = [];
  for (var i = 0; i < headers.length; ++i) {
    var key = normalizeHeader(headers[i]);
    if (key.length > 0) {
      keys.push(key);
    }
  }
  return keys;
}

/**
* Normalizes a string, by removing all alphanumeric characters and using mixed case
* to separate words. The output will always start with a lower case letter.
* This function is designed to produce JavaScript object property names.
* Examples:
*   "First Name" -> "firstName"
*   "Market Cap (millions) -> "marketCapMillions
*   "1 number at the beginning is ignored" -> "numberAtTheBeginningIsIgnored"
* @param {string} string to normalize
* @return {string} normalized string
*/
function normalizeHeader(header) {
  var key = "";
  var upperCase = false;
  for (var i = 0; i < header.length; ++i) {
    var letter = header[i];
    if (letter == " " && key.length > 0) {
      upperCase = true;
      continue;
    }
    if (!isAlnum(letter) && !isDot(letter) && !isUnderscore(letter)) {
      continue;
    }
    if (key.length == 0 && isDigit(letter)) {
      continue; // first character must be a letter
    }
    if (upperCase) {
      upperCase = false;
      key += letter.toUpperCase();
    } else {
      key += letter.toLowerCase();
    }
  }
  return key;
}

/**
*
* @param {string}
* @return {boolean} true if the cell where cellData was read from is empty.
*/
function isCellEmpty(cellData) {
  return typeof(cellData) == "string" && cellData == "";
}

/**
* @param {string}
* @return {boolean} true if the character char is alphabetical, false otherwise.
*/
function isAlnum(char) {
  return char >= 'A' && char <= 'Z' ||
    char >= 'a' && char <= 'z' ||
    isDigit(char);
}

/**
* @param {string}
* @return {boolean} true if the character is a .
*/
function isDot(char) {
  return char === ".";
}

/**
* @param {string}
* @return {boolean} true if the character is a .
*/
function isUnderscore(char) {
  return char === "_";
}


/**
* @param {array}
* @param {string} the key to sort on
* @return {array} the sorted array
*/
function alphabetize(arr, key) {
  return arr.sort(function compare(a, b) {
    if (a[key].toLowerCase() > b[key].toLowerCase()){return 1;}
    if (a[key].toLowerCase() < b[key].toLowerCase()){return -1;}
    return 0;
  });
}

/**
* @param {string}
* @return {boolean} Returns true if the character char is a digit, false otherwise.
*/
function isDigit(char) {
  return char >= '0' && char <= '9';
}

function getId() {
  var scriptProperties = PropertiesService.getScriptProperties();
  return scriptProperties.getProperty('ssid');
}