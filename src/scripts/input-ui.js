/*global define */
/*jslint unparam: true, node: true*/

/* Modules */
var events = require("events");
var chalk = require("chalk");
var keypress = require("keypress");
var copy_paste = require("copy-paste");


/* Globals */

/* Function key code */
var functionKeyCodeReAnywhere = new RegExp('(?:\x1b+)(O|N|\\[|\\[\\[)(?:' +
      ['(\\d+)(?:;(\\d+))?([~^$])',
      '(?:M([@ #!a`])(.)(.))',
      '(?:1;)?(\\d+)?([a-zA-Z])'].join('|') + ')');

/* Meta key code */
var metaKeyCodeReAnywhere = /(?:\x1b)([a-zA-Z0-9])/;


/* Helper functions */

/*
 * @function codePointAt
 *  returns the character code of character in a string. From joyent on github.
 * @param str - string to be searched.
 * @param character - index of character in the string.
 */
function codePointAt(str, index)
{
  var code = str.charCodeAt(index);
  var low;

  if (0xd800 <= code && code <= 0xdbff)
  {
    low = str.charCodeAt(index + 1);

    if (!isNaN(low))
    {
      code = 0x10000 + (code - 0xd800) * 0x400 + (low - 0xdc00);
    }
  }

  return code;
}

/*
 * @function stripVTControlCharacters
 *  remove control characters from string.
 * @param str - string to be stripped.
 */
function stripVTControlCharacters(str)
{
  str = str.replace(new RegExp(functionKeyCodeReAnywhere.source, 'g'), '');
  return str.replace(new RegExp(metaKeyCodeReAnywhere.source, 'g'), '');
}

/*
 * @function isFullWidthCodePoint
 *  check if character corresponding to code point is more than one column
 *  long.
 * @param code - the code point of the character in question.
 */
function isFullWidthCodePoint(code) {
  if (isNaN(code))
  {
    return false;
  }

  if (code >= 0x1100 && (
      code <= 0x115f ||  // Hangul Jamo
      0x2329 === code || // LEFT-POINTING ANGLE BRACKET
      0x232a === code || // RIGHT-POINTING ANGLE BRACKET
      // CJK Radicals Supplement .. Enclosed CJK Letters and Months
      (0x2e80 <= code && code <= 0x3247 && code !== 0x303f) ||
      // Enclosed CJK Letters and Months .. CJK Unified Ideographs Extension A
      0x3250 <= code && code <= 0x4dbf ||
      // CJK Unified Ideographs .. Yi Radicals
      0x4e00 <= code && code <= 0xa4c6 ||
      // Hangul Jamo Extended-A
      0xa960 <= code && code <= 0xa97c ||
      // Hangul Syllables
      0xac00 <= code && code <= 0xd7a3 ||
      // CJK Compatibility Ideographs
      0xf900 <= code && code <= 0xfaff ||
      // Vertical Forms
      0xfe10 <= code && code <= 0xfe19 ||
      // CJK Compatibility Forms .. Small Form Variants
      0xfe30 <= code && code <= 0xfe6b ||
      // Halfwidth and Fullwidth Forms
      0xff01 <= code && code <= 0xff60 ||
      0xffe0 <= code && code <= 0xffe6 ||
      // Kana Supplement
      0x1b000 <= code && code <= 0x1b001 ||
      // Enclosed Ideographic Supplement
      0x1f200 <= code && code <= 0x1f251 ||
      // CJK Unified Ideographs Extension B .. Tertiary Ideographic Plane
      0x20000 <= code && code <= 0x3fffd))
  {
    return true;
  }

  return false;
}

/*
 * @function numLines
 *  returns the number of lines in a string.
 * @param str - the string in question.
 */
function numLines(str) {
  var matches = str.match(/.*\n/g);

  if(matches)
  {
      return matches.length + 1;
  }
  else
  {
    return 1;
  }
}

/* Input UI functionality */
define(["q", "./output-ui"], function(Q, outputUI) {
  /* Instantiate modules */
  var renderer = new outputUI.Renderer('default');
  var indenter = new outputUI.Indenter('  ');

  /*
   * @class InputUI
   *  class encapsulating command line editing functionality.
   * @param rt - repl pyret runtime.
   * @param input - input stream.
   * @param output - output stream.
   */
  function InputUI(rt, input, output)
  {
    /* Pyret runtime */
    this.runtime = rt;

    /* Input stream */
    this.input = input;

    /* Output stream */
    this.output = output;

    /* Editing text */
    this.text = "";

    /* Text display variables */
    this.lastCursorRow = 0;
    this.lastDisplayRow = 0;

    /* Editing history array */
    this.history = [{"old": "", "cur": ""}];

    /* History array index */
    this.historyIndex = 0;

    /* Latest updated history index */
    this.historyUpdate = 0;

    /* Prompt symbol */
    this.promptSymbol = ">>";

    /* Full prompt string */
    this.promptString = "";

    /* Prompt number */
    this.promptNumber = 0;

    /* Interaction enabled */
    this.listening = true;

    /* Indent array for text */
    this.indentArray = [];

    /* Current cursor position in block */
    this.cursorPosition = 0;

    /* Current screen row */
    this.screenPosition = this.output.rows - 1;

    /* Last pressed key */
    this.lastKey = "";

    /* Prepare stdin for keypresses */
    this.input.setRawMode(true);
    this.input.setEncoding("utf8");
    this.input.resume();
    keypress(this.input);

    /* Set keypress event callback */
    this.input.on("keypress", this.keypress.bind(this));
  }

  /*
  * @function prompt
  *   display the prompt, and update appropriate variables.
  */
  InputUI.prototype.prompt = function()
  {
    /* Disable interaction while displaying prompt */
    this.setListening(false);

    /* Increase prompt number */
    this.promptNumber += 1;

    /* Clear text being edited */
    this.resetText();

    /* Construct prompt string */
    this.promptString = "> ";

    /* Write newline */
    this.output.write("\n");

    /* Refresh cursor and text being edited */
    this.refreshText(false);

    /* Enable interaction again */
    this.setListening(true);
  };

  /*
  * @function isListening
  *   checks if listening is enabled.
  */
  InputUI.prototype.isListening = function()
  {
    return this.listening;
  };

  /*
  * @function setListening
  *   enables or disables keypress listening.
  * @param bool - the boolean value used to enable or disable listening.
  */
  InputUI.prototype.setListening = function(bool)
  {
    this.listening = !!bool;
  };

  /*
  * @function getPromptNumber
  *   get the prompt number.
  */
  InputUI.prototype.getPromptNumber = function()
  {
    return this.promptNumber;
  };

  /*
  * @function getLine
  *   returns line at the character offset from the cursor.
  * @param offset - the offset past the cursor position.
  * @param ignoreNewline - whether or not to ignore newlines at the end of the
  *   string.
  */
  InputUI.prototype.getLine = function(offset, ignoreNewline)
  {
    /* Get all lines */
    var matches = this.text.match(/.*\n|.+$/g);

    /* Get line number within text block */
    var lineIndex = numLines(this.text.slice(0, this.cursorPosition)) - 1 +
      offset;

    if(matches)
    {
      /* Bound line index */
      lineIndex = Math.max(Math.min(lineIndex, matches.length - 1), 0);

      /* If last line, and newline at the end */
      if(lineIndex === matches.length - 1 &&
	  this.text.charAt(this.text.length - 1) === "\n" &&
	  !ignoreNewline)
      {
	return "";
      }
      else
      {
	/* Return match at line index */
	return matches[lineIndex];
      }
    }
    else
    {
      /* Return entire block if no matches */
      return this.text;
    }
  };

  /*
  * @function getLinesBefore
  *   get lines up to the given line index.
  * @param str - the string to get lines from.
  * @param endLineIndex - the index to get lines up to.
  * @param ignoreNewline - whether or not to ignore newlines at the end of the
  *   string.
  */
  InputUI.prototype.getLinesBefore = function(str, endLineIndex, ignoreNewline)
  {
    /* Get all lines */
    var matches = str.match(/.*\n|.+$/g);

    if(matches)
    {
      /* Bound end line */
      endLineIndex = Math.max(Math.min(endLineIndex, matches.length), 0);

      /* Return all lines */
      if(endLineIndex === matches.length &&
	  str.charAt(str.length - 1) === "\n" && !ignoreNewline)
      {
	return matches;
      }
      else
      {
	/* Get lines before index, taking into account wrapped lines */
	var lines = [];
	var curMatch = matches.shift();
	var lineIndex = endLineIndex;

	/* Loop over lines */
	while(curMatch && lineIndex > 0) {
	  lines.push(curMatch);

	  /* Decrement line index by number of lines in match */
	  if(curMatch.charAt(curMatch.length - 1) === "\n")
	  {
	    lineIndex -= (numLines(curMatch) - 1);
	  }
	  else
	  {
	    lineIndex -= numLines(curMatch);
	  }

	  /* Get next match */
	  curMatch = matches.shift();
	}

	/* Remove last line if necessary */
	if(lineIndex < 0)
	{
	  lines = lines.slice(0, lines.length - 1);
	}

	/* Return lines */
	return lines;
      }
    }
    else
    {
      /* Return no lines if no matches */
      return [];
    }
  };

  /*
  * @function getLineUntilCursor
  *   get the current line until the cursor position.
  */
  InputUI.prototype.getLineUntilCursor = function()
  {
    /* Get all lines */
    var matches = this.text.match(/.*\n|.+$/g);

    /* Save cursor position */
    var cursorPos = this.cursorPosition;

    if(matches && matches.length > 1)
    {
      /* Get current line */
      var curMatch = matches.shift();
      var lastMatch = curMatch;

      /* Loop over matches */
      while(lastMatch && cursorPos > lastMatch.length)
      {
	cursorPos -= curMatch.length;
	lastMatch = matches.shift();
	curMatch = lastMatch || curMatch;
      }

      /* Return line until cursor */
      return curMatch.slice(0, cursorPos);
    }
    else
    {
      /* Return text until cursor */
      return this.text.slice(0, cursorPos);
    }
  };

  /*
  * @function getCursorDisplay
  *   get screen cursor position.
  */
  InputUI.prototype.getCursorDisplay = function()
  {
    return this.getDisplay(
	this.promptString +
	this.highlightText(this.text.slice(0, this.cursorPosition)),
	this.output.columns);
  };

  /*
  * @function moveCursor
  *   move the cursor using the offset.
  * @param offset
  *   the offset to mvoe the cursor.
  */
  InputUI.prototype.moveCursor = function(offset)
  {
    /* Usable width of the screen */
    var screenWidth = this.output.columns - this.promptString.length;

    /* Screen rows to move cursor */
    var diff;

    if(offset < 0)
    {
      /* Get negative diff */
      diff = -this.getDisplay(
	  this.text.slice(this.cursorPosition + offset,
	    this.cursorPosition), screenWidth).rows;
    }
    else
    {
      /* Get positive diff */
      var cursorPos = this.getDisplay(this.text.slice(0,
	    this.cursorPosition), screenWidth);

      diff = this.getDisplay(
	  this.text.slice(this.cursorPosition - cursorPos.cols,
	    this.cursorPosition + offset), screenWidth).rows;
    }

    /* Update screen and cursor positions */
    this.screenPosition += diff;
    this.cursorPosition += offset;
  };

  /*
  * @function getDisplay
  *   get width and height in rows and columns of the string.
  * @param str - the string in question.
  * @param screenWidth - width of the screen.
  */
  InputUI.prototype.getDisplay = function(str, screenWidth)
  {
    var offset = 0;
    var row = 0;
    var code, i;

    /* Strip control characters */
    str = stripVTControlCharacters(str);

    /* Iterate over string */
    for (i = 0; i < str.length; i++)
    {
      code = codePointAt(str, i);

      /* Continue if code point greater than 0x10000 */
      if (code >= 0x10000)
      {
	i++;
      }

      /* Accounts for multiline strings */
      if (code === 0x0a)
      {
	row += 1 + ((offset % screenWidth === 0 && offset > 0) ?
	    ((offset / screenWidth) - 1) :
	    (offset - (offset % screenWidth)) / screenWidth);
	offset = 0;
	continue;
      }

      /* Accounts for full width code points */
      if (isFullWidthCodePoint(code))
      {
	if ((offset + 1) % screenWidth === 0)
	{
	  offset++;
	}

	offset += 2;
      }
      else
      {
	offset++;
      }
    }

    /* Construct rows and columns */
    var cols = offset % screenWidth;
    var rows = row + (offset - cols) / screenWidth;

    /* Return object containing row and columns */
    return {cols: cols, rows: rows};
  };

  /*
  * @function resetText
  *   reset text and related variables.
  */
  InputUI.prototype.resetText = function()
  {
    this.text = "";
    this.cursorPosition = 0;
    this.screenPosition = this.output.rows - 1;
    this.lastCursorRow = 0;
    this.lastDisplayRow = 0;
  };

  /*
  * @function addString
  *   insert string into text.
  * @param str - the string to insert.
  */
  InputUI.prototype.addString = function(str)
  {
    /* Insert string */
    if(this.cursorPosition < this.text.length)
    {
      this.text = this.text.substring(0, this.cursorPosition) + str +
	this.text.substring(this.cursorPosition, this.text.length);
    }
    /* Append string */
    else
    {
      this.text += str;
    }

    /* Reset cursor position */
    this.cursorPosition += str.length;

    /* Refresh text and add index */
    if(str === " ")
    {
      this.refreshText(false);
    }
    else
    {
      this.addIndent();
    }

    /* Sync history */
    this.updateHistory();
  };

  /*
  * @function addIndent
  *   add indent to current line.
  */
  InputUI.prototype.addIndent = function()
  {
    /* Update indent array for lines up to cursorPosition */
    this.updateIndentArray();

    /* Get current line */
    var curLine = this.getLine(0, false);

    /* Get indent */
    var indent = indenter.getIndent(this.indentArray,
	this.text.slice(0, this.cursorPosition).split("\n").length - 1);

    /* Add indent to text */
    var lineNoIndent = curLine.replace(/^([^\S\n]+)/, "");
    var lineIndent = indent + lineNoIndent;
    this.text = this.replaceLine(0, lineIndent);

    /* Move cursor */
    var oldCursorPos = this.getCursorDisplay();
    var diff = lineIndent.length - curLine.length;
    this.moveCursor(diff);

    /* Correct if row changed */
    if(oldCursorPos.rows !== this.getCursorDisplay().rows)
    {
      this.moveCursor(-diff);
      this.moveCursor(-(oldCursorPos.cols - this.promptString.length));
    }

    /* Refresh text */
    this.refreshText(false);
  };

  /*
  * @function addHistory
  *   add history entry, after the current command has been run. Revert old
  *   entries if they have been modified.
  */
  InputUI.prototype.addHistory = function()
  {
    var spaceRegex = /^\s*$/g;

    /* Revert old history entries */
    if(this.historyUpdate >= 0)
    {
      this.history = this.history.slice(0, this.historyUpdate).map(function(l) {
	return {"old": l.old, "cur": l.old};
      }).concat(this.history.slice(this.historyUpdate, this.history.length));
    }

    /* Add new entry if not empty or a duplicate */
    if(!(this.text.match(spaceRegex) || (this.history.length > 1 &&
	    this.history[1].old === this.text)))
    {
      this.history[0] = {
	"old": this.text,
	"cur": this.text};
      this.history.unshift({"old": "", "cur": ""});
    }

    /* Reset history tracking variables */
    this.historyIndex = 0;
    this.historyUpdate = 0;
  };

  /*
  * @function updateHistory
  *   update entry at current history index.
  */
  InputUI.prototype.updateHistory = function()
  {
    /* Update entry at current history index */
    this.history[this.historyIndex].cur = this.text;

    /* Set the furthest updated location in history */
    this.historyUpdate = Math.max(this.historyIndex + 1, this.historyUpdate);
  };

  /*
  * @function updateIndentArray
  *   update indent array, containing indent levels.
  */
  InputUI.prototype.updateIndentArray = function() {
    /* Get lines before cursor position */
    var lines = this.text.split("\n");

    /* Reset indent array */
    this.indentArray = indenter.getIndentArray(lines, []);
  };

  /*
  * @function replaceLine
  *   replace line offset rows from the current line.
  */
  InputUI.prototype.replaceLine = function(offset, str)
  {
    /* Get lines */
    var matches = this.text.match(/.*\n|.+$/g);

    /* Get current line index */
    var lineIndex = numLines(this.text.slice(0, this.cursorPosition)) - 1 +
      offset;

    if(matches)
    {
      /* Bound line index */
      lineIndex = Math.max(Math.min(lineIndex, matches.length - 1), 0);

      /* Replace current line with str */
      if(lineIndex === matches.length - 1 &&
	  this.text.charAt(this.text.length - 1) === "\n")
      {
	matches.push(str);
      }
      else
      {
	matches[lineIndex] = str;
      }

      /* Return updated text */
      return matches.join("");
    }
    else
    {
      return "";
    }
  };

  /*
  * @function highlightText
  *   highlight text.
  */
  InputUI.prototype.highlightText = function(text)
  {
    /* Get lines */
    var matches = text.match(/.*\n|.+$/g);

    if(matches)
    {
      /* Prettified text */
      var htext = renderer.highlightLine(matches.shift());

      /* Highlight lines */
      matches.forEach(function(m)
      {
	htext += "  " + renderer.highlightLine(m);
      }, this);

      /* Add line number for empty line */
      if(text.charAt(text.length - 1) === "\n")
      {
	htext += "  ";
      }

      return htext;
    }
    else
    {
      return text;
    }
  };

  /*
  * @function refreshText
  *   
  */
  InputUI.prototype.refreshText = function(jumpEOL)
  {
    /* Get highlighted text */
    var displayText = this.highlightText(this.text);
    displayText = this.promptString + displayText;

    /* Bound screen position */
    this.screenPosition = Math.max(Math.min(this.screenPosition,
	  this.output.rows - 1), 0);

    /* Get text display position */
    var displayPos = this.getDisplay(displayText, this.output.columns);

    /* Bound cursor position, and set screen position */
    this.cursorPosition = Math.max(Math.min(this.cursorPosition,
	  this.text.length), 0);

    /* If jumpEOL is true */
    if(jumpEOL)
    {
      this.cursorPosition = this.text.length;
      this.lastDisplayRow = displayPos.rows;
    }

    /* Get display position of text up to cursor */
    var cursorDisplayPos = this.getCursorDisplay();

    /* Update display position, cursor display, and display text if display
     * position exceeds size of the output window */
    if(displayPos.rows >= this.output.rows)
    {
      /* Update last display row if cursor moves past currently displayed text */
      if(this.lastDisplayRow - cursorDisplayPos.rows >= this.output.rows)
      {
	this.lastDisplayRow -= 1;
      }
      else if(cursorDisplayPos.rows > this.lastDisplayRow)
      {
	this.lastDisplayRow += 1;
      }

      /* Cut display text at the end of the screen */
      var displayLines = this.getLinesBefore(displayText, this.lastDisplayRow + 1,
	  true);

      displayText = displayLines.join("");

      /* Do not newline at end of display text */
      if(displayText.charAt(displayText.length - 1) == "\n")
      {
	displayText = displayText.slice(0, displayText.length - 1);
      }
    }
    else
    {
      /* Set last display row */
      this.lastDisplayRow = displayPos.rows;
    }

    /* Move cursor to position to clear from. Use previous cursor offset from
     * the start of the text  */
    if (this.lastCursorRow > 0) {
      this.output.moveCursor(0, -this.lastCursorRow);
    }

    /* Set row offset */
    this.lastCursorRow = cursorDisplayPos.rows;

    /* Move cursor to left edge of the screen */
    this.output.cursorTo(0);

    /* Clear the screen below the cursor */
    this.output.clearScreenDown();

    /* Write the display text */
    this.output.write(displayText);

    /* Force terminal to allocate new line if last is empty */
    if (displayPos.cols === 0) {
      this.output.write(' ');
    }

    /* Move cursor to original column */
    this.output.cursorTo(cursorDisplayPos.cols);

    /* Move cursor to original row */
    this.output.moveCursor(0, cursorDisplayPos.rows - this.lastDisplayRow);
  };

  /**
      @function annotation
   **/
  InputUI.prototype.doublePress = function(key, success, failure, timeout) {
    if(this.lastKey === key) {
      this.lastKey = "";
      clearTimeout(this[key + 'Var']);
      success();
    }
    else {
      this.lastKey = key;

      this[key + 'Var'] = setTimeout(function() {
	this.lastKey = "";
	failure();
      }.bind(this), timeout);
    }
  };

  /**
      @function annotation
   **/
  InputUI.prototype.enter = function(cmd) {
      if(this.canRun()) {
	this.run();
      }
      else {
	this.addString("\n");
      }
  };

  /**
      @function annotation
   **/
  InputUI.prototype.canRun = function() {
    var curLine = this.getLine(0, false);
    var displayLines = numLines(this.text);
    var cursorLines = numLines(this.text.slice(0, this.cursorPosition));

    this.updateIndentArray();

    return this.indentArray.length === 0 ||
      this.indentArray[this.indentArray.length - 1].indent_level === 0;
  };

  /**
      @function annotation
   **/
  InputUI.prototype.run = function() {
    this.addHistory();
    this.refreshText(true);
    this.output.write("\n");
    this.emit('command', this.text);
  };

  /**
      @function annotation
   **/
  InputUI.prototype.tab = function() {
    this.doublePress("tab", function() {
      this.indentAll();
    }.bind(this), function() {
	this.addIndent();
    }.bind(this), 200);
  };

  /**
      @function annotation
   **/
  InputUI.prototype.indentAll = function() {
      var oldCursorPos = this.cursorPosition;
      var lastCursorPos = -1;
      this.cursorPosition = 0;

      while(this.cursorPosition !== lastCursorPos) {
	lastCursorPos = this.cursorPosition;
	this.addIndent();
	this.nextLine();
      }

      this.cursorPosition = oldCursorPos;
      this.refreshText(false);
  };

  /**
      @function annotation
   **/
  InputUI.prototype.historyPrev = function() {
    if(this.historyIndex < this.history.length - 1) {
      this.historyIndex += 1;
      this.text = this.history[this.historyIndex].cur;
      this.refreshText(true);
    }
  };

  /**
      @function annotation
   **/
  InputUI.prototype.historyNext = function() {
    if(this.historyIndex > 0) {
      this.historyIndex -= 1;
      this.text = this.history[this.historyIndex].cur;
      this.refreshText(true);
    }
  };

  InputUI.prototype.prevLine = function()
  {
    if(numLines(this.text.slice(0, this.cursorPosition)) > 1) {
      var curLineSlice = this.getLineUntilCursor();
      var nextLine = this.getLine(-1, true);

      var oldCursorLines = numLines(this.text.slice(0, this.cursorPosition));
      this.moveCursor(-nextLine.length);
      var newCursorLines = numLines(this.text.slice(0, this.cursorPosition));

      if(newCursorLines !== oldCursorLines - 1 && oldCursorLines > 1) {
	this.moveCursor(nextLine.length - (curLineSlice.length + 1));
      }

      this.refreshText(false);
    }
  };

  InputUI.prototype.nextLine = function()
  {
    if(numLines(this.text.slice(this.cursorPosition, this.text.length)) > 1) {
      var curLine = this.getLine(0, true);
      var curLineSlice = this.getLineUntilCursor();
      var nextLine = this.getLine(1, true);

      var oldCursorLines = numLines(this.text.slice(0, this.cursorPosition));
      this.moveCursor(curLine.length);
      var newCursorLines = numLines(this.text.slice(0, this.cursorPosition));

      if(newCursorLines !== oldCursorLines + 1) {
	this.moveCursor(-curLineSlice.length);
	this.moveCursor(nextLine.length - 1);
      }

      this.refreshText(false);
    }
  };

  /**
      @function annotation
   **/
  InputUI.prototype.keyUp = function() {
    this.historyPrev();
  };

  /**
      @function annotation
   **/
  InputUI.prototype.keyDown = function() {
    this.historyNext();
  };

  /**
      @function annotation
   **/
  InputUI.prototype.keyRight = function() {
    if(this.cursorPosition < this.text.length) {
      this.moveCursor(1);
    }

    this.refreshText(false);
  };

  /**
      @function annotation
   **/
  InputUI.prototype.keyLeft = function() {
    if(this.cursorPosition > 0) {
      this.moveCursor(-1);
    }

    this.refreshText(false);
  };

  /**
      @function annotation
   **/
  InputUI.prototype.backspace = function() {
    if(this.cursorPosition > 0) {
      this.text = this.text.substring(0, this.cursorPosition - 1) +
	this.text.substring(this.cursorPosition, this.text.length);

      this.moveCursor(-1);
      this.refreshText(false);
      this.updateHistory();
    }
  };

  /**
      @function annotation
   **/
  InputUI.prototype.keyboardInterrupt = function() {
    this.refreshText(true);

    if(this.indentArray.length > 0 || this.text !== "") {
      this.indentArray = [];

      this.updateHistory();
      this.resetText();
      this.prompt();
    }
    else {
      this.exit();
    }
  };

  /**
      @function annotation
   **/
  InputUI.prototype.exit = function() {
    process.exit();
  };

  /**
      @function annotation
   **/
  InputUI.prototype.pasteToRepl = function() {
    copy_paste.paste(function(_, text) {
      text = text.replace(/\r/g, "\n");
      this.addString(text);
    }.bind(this));
  };

  /**
      @function annotation
   **/
  InputUI.prototype.copy = function() {
    this.doublePress("ctrl-y", function() {
      this.copyBlock();
    }.bind(this), function() {
      this.copyLine();
    }.bind(this), 300);
  };

  /**
      @function annotation
   **/
  InputUI.prototype.copyBlock = function() {
    copy_paste.copy(this.text);
  };

  /**
      @function annotation
   **/
  InputUI.prototype.copyLine = function() {
    copy_paste.copy(this.getLine(0, true));
  };

  /**
      @function annotation
   **/
  InputUI.prototype.cursorToStartLine = function() {
    var lineUntilCursor = this.getLineUntilCursor();

    if (lineUntilCursor.length === 0 || lineUntilCursor.charAt(lineUntilCursor.length - 1) !== "\n") {
      this.moveCursor(-lineUntilCursor.length);
      this.refreshText(false);
      this.updateHistory();
    }
  };

  /**
      @function annotation
   **/
  InputUI.prototype.cursorToEndLine = function() {
    var lineUntilCursor = this.getLineUntilCursor();
    var curLine;

    if (lineUntilCursor.length === 0 || lineUntilCursor.charAt(lineUntilCursor.length - 1) !== "\n") {
      this.moveCursor(-lineUntilCursor.length);
    }

    this.moveCursor(1);
    curLine = this.getLine(0, true);
    this.moveCursor(-1);
    this.moveCursor(curLine.length > 0 ? curLine.length - 1 : 0);
    this.refreshText(false);
    this.updateHistory();
  };

  InputUI.prototype.keypress = function(ch, key)
  {
    if(!this.isListening())
    {
      return;
    }

    if(key && (key.name === "return" || key.name === "enter"))
    {
      this.enter();
    }
    else if(key && key.name === "tab")
    {
      this.tab();
    }
    else if(key && key.name === "up")
    {
      this.keyUp();
    }
    else if(key && key.name === "down")
    {
      this.keyDown();
    }
    else if(key && key.name === "right")
    {
      this.keyRight();
    }
    else if(key && key.name === "left")
    {
      this.keyLeft();
    }
    else if(key && key.ctrl && key.name === "a")
    {
      this.cursorToStartLine();
    }
    else if(key && key.ctrl && key.name === "e")
    {
      this.cursorToEndLine();
    }
    else if(key && key.name === "backspace")
    {
      this.backspace();
    }
    else if(key && key.ctrl && key.name === "y")
    {
      this.copy();
    }
    else if(key && key.ctrl && key.name === "v")
    {
      this.pasteToRepl();
    }
    else if(key && key.ctrl && key.name === "c")
    {
      this.keyboardInterrupt();
    }
    else if(key && key.ctrl && key.name === "d")
    {
      this.exit();
    }
    else if(key && key.ctrl && key.name === "n")
    {
      this.addString("\n");
    }
    else
    {
      if(ch)
      {
	this.addString(ch);
      }
    }
  };

  /* TODO: match multiple patterns on same line for indenting */
  /* TODO: fix pasting */
  /* TODO: import directive */
  /* TODO: document (how to use and extend) */
  /* TODO: tests */
  InputUI.prototype.__proto__ = events.EventEmitter.prototype;

  return function(runtime) {
    return new InputUI(runtime, process.stdin, process.stdout);
  };
});
