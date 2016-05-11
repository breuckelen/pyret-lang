/*global define */
/*jslint unparam: true, node: true*/

/* Packages */
var chalk = require("chalk");

/* Additional String methods */
if(!String.prototype.hasOwnProperty("repeat"))
{
  String.prototype.repeat = function(num)
  {
    var ret = "";

    while(num-- > 0)
    {
      ret += this;
    }

    return ret;
  };
}

if(!String.prototype.hasOwnProperty("eat"))
{
  String.prototype.eat = function(reg)
  {
    return this.replace(reg, "");
  };
}

/* @class StringStream
 *    a class used to process text by pattern matching.
 */
function StringStream(string, tabSize)
{
  this.pos = this.start = 0;
  this.string = string;
  this.tabSize = tabSize || 8;
  this.lastColumnPos = this.lastColumnValue = 0;
}

StringStream.prototype = {
  eol: function() { return this.pos >= this.string.length; },
  peek: function() { return this.string.charAt(this.pos) || undefined; },
  next: function()
  {
    if (this.pos < this.string.length) {
      return this.string.charAt(this.pos++);
    }
  },
  eat: function(match)
  {
    var ch = this.string.charAt(this.pos);
    var ok;

    if (typeof match === "string") {
      ok = (ch === match);
    }
    else {
      ok = ch && (match.test ? match.test(ch) : match(ch));
    }
    if (ok) {
      ++this.pos;
      return ch;
    }
  },
  eatSpace: function() {
    var start = this.pos;
    while (/[\s\u00a0]/.test(this.string.charAt(this.pos))) {
      ++this.pos;
    }
    return this.pos > start;
  },
  match: function(pattern, match_group, consume, caseInsensitive) {
    if (typeof pattern === "string") {
      var cased = function(str) {return caseInsensitive ? str.toLowerCase() : str;};
      var substr = this.string.substr(this.pos, pattern.length);
      if (cased(substr) === cased(pattern)) {
	if (consume !== false) {
	  this.pos += pattern.length;
	}
	return true;
      }
    } else {
      var match = this.string.slice(this.pos).match(pattern);
      if (match && match.index > 0) {
	return null;
      }
      if (match && consume !== false) {
	this.pos += match[match_group].length;
      }
      return match;
    }
  }
};

/* @function wordRegexp
 *    make single regular expression from multiple words.
 */
function wordRegexp(words, startString) {
  var startPattern = startString ? "^\\s*((" : "((";
  var endPattern = "))(\\s+|$|\\b|(?![a-zA-Z0-9-_]))";
  return new RegExp(startPattern + words.join(")|(") + endPattern);
}

/* @function getNextState
 *    update the state to reflect the last token, and return the current style.
 */
function getNextState(state, token, style) {
  state.lastToken = token;
  return style;
}

/* @function getNextHighlight
 *    get the next highlight for the token stream, using the colorscheme.
 */
function getNextHighlight(stream, state, tokens) {
  var token;
  var match;

  /* Space */
  if(stream.eatSpace())
  {
    return getNextState(state, ' ', undefined);
  }

  for(token in tokens)
  {
    if(tokens.hasOwnProperty(token))
    {
      match = stream.match(tokens[token].pattern, tokens[token].highlight_group);

      if(match)
      {
	return getNextState(state, match[tokens[token].highlight_group],
	    token);
      }
    }
  }

  return getNextState(state, stream.next(), undefined);
}

function getTokens(text, state, tokens, pushHighlight) {
  var stream = new StringStream(text, 2);

  var start = 0;
  var highlight = null;
  var nextHighlight;

  while (!stream.eol()) {
    nextHighlight = getNextHighlight(stream, state, tokens);

    if(highlight !== nextHighlight) {
      pushHighlight(start, stream.start, highlight);
      start = stream.start;
      highlight = nextHighlight;
    }

    stream.start = stream.pos;
  }

  if (start < stream.pos) {
    pushHighlight(start, stream.pos, highlight);
  }
}

/* Token regex */
var pyret_name = new RegExp("^[a-zA-Z_][a-zA-Z0-9$_\\-]*");
var pyret_keywords = wordRegexp(["fun", "method", "var", "when", "import",
  "provide", "data", "end", "except", "for", "from", "and", "or", "not", "as",
  "if", "else", "cases", "check", "lam", "doc", "try", "ask", "otherwise",
  "then", "with", "sharing", "where", "block"], false);
var pyret_keywords_no_indent = wordRegexp(["otherwise", "then", "with", "sharing",
  "where"], true);
var pyret_punctuation = wordRegexp(["::", "==", ">=", "<=", "=>", "->", ":=",
  "<>", ":", "\\.", "<", ">", ",", "\\^", ";", "\\|", "=", "\\+", "\\*", "/",
  "\\\\", "\\(", "\\)", "\\{", "\\}", "\\[", "\\]"], true);
var pyret_initial_operators = wordRegexp([ "\\-", "\\+", "\\*", "/", "<",
  "<=", ">", ">=", "==", "<>", "\\.", "\\^", "is", "raises", "satisfies"],
  false);

/* Colorscheme map */
var colorschemes = {
  'default': {
    'space': {
      'pattern': /\s+/,
      'highlight_group': 0,
      'highlight': function(str) { return str; }
    },
    'comment': {
      'pattern': /^#.*$/,
      'highlight_group': 0,
      'highlight': chalk.cyan
    },
    'number': {
      'pattern': /^[0-9]+(\.[0-9]+)?/,
      'highlight_group': 0,
      'highlight': chalk.green
    },
    'string': {
      'pattern': /^('.*')|(".*")/,
      'highlight_group': 0,
      'highlight': chalk.green.dim
    },
    'builtin': {
      'pattern': pyret_punctuation,
      'highlight_group': 0,
      'highlight': chalk.cyan
    },
    'keyword': {
      'pattern': pyret_keywords,
      'highlight_group': 0,
      'highlight': chalk.magenta.dim
    },
    'function': {
      'pattern': /^([a-zA-Z0-9$_\-]+)\s*\(/,
      'highlight_group': 1,
      'highlight': chalk.white
    },
    'variable': {
      'pattern': /^([a-zA-Z0-9$_\-]+)(?![a-zA-Z0-9-_])/,
      'highlight_group': 0,
      'highlight': function(str) { return str; }
    },
    'type': {
      'pattern': /^(?:(?:\|)|(?:::))\s*([a-zA-Z0-9$_\-]*)/,
      'highlight_group': 1,
      'highlight': chalk.blue.dim
    },
    'error': {
      'pattern': null,
      'highlight_group': 0,
      'highlight': chalk.red
    },
    'name': {
      'pattern': null,
      'highlight_group': 0,
      'highlight': chalk.white
    },
    'loc': {
      'pattern': null,
      'highlight_group': 0,
      'highlight': chalk.blue
    },
    'stack_trace': {
      'pattern': null,
      'highlight_group': 0,
      'highlight': chalk.blue
    },
    'check_success': {
      'pattern': null,
      'highlight_group': 0,
      'highlight': chalk.green
    },
    'check_failure': {
      'pattern': null,
      'highlight_group': 0,
      'highlight': chalk.red
    },
    'check_neutral': {
      'pattern': null,
      'highlight_group': 0,
      'highlight': chalk.blue
    },
    'catchall': {
      'pattern': /.*/,
      'highlight_group': 0,
      'highlight': function(str) { return str; }
    }
  }
};

/* Indent map */
var indents = {
  'indent_double':
  {
    'pattern': wordRegexp(['data', 'ask', 'cases'], false),
    'indent_offset': function(indentArray, index) {
      return 0;
    },
    'indent_level': function(indentArray, index) {
      return 2;
    }
  },
  'indent_single':
  {
    'pattern': wordRegexp(['if', 'fun', 'check', 'lam', '\\('], false),
    'indent_offset': function(indentArray, index) {
      return 0;
    },
    'indent_level': function(indentArray, index) {
      return 1;
    }
  },
  'unindent_single_soft':
  {
    'pattern': wordRegexp(['\\|', 'else', 'where'], true),
    'indent_offset': function(indentArray, index) {
      return -1;
    },
    'indent_level': function(indentArray, index) {
      return 0;
    }
  },
  'sharing':
  {
    'pattern': wordRegexp(['sharing'], false),
    'indent_offset': function(indentArray, index) {
      return -2;
    },
    'indent_level': function(indentArray, index) {
      return 1;
    }
  },
  'close_parantheses':
  {
    'pattern': wordRegexp(['\\)'], false),
    'indent_offset': function(indentArray, index) {
      return 0;
    },
    'indent_level': function(indentArray, index) {
      return -1;
    }
  },
  'end':
  {
    'pattern': wordRegexp(['end', ';'], false),
    'indent_offset': function(indentArray, index) {
      return 0;
    },
    'indent_level': function(indentArray, index) {
      if(index > 0) {
	var level = indentArray[index].indent_level;
	var lastLevel = indentArray[index - 1].indent_level;
	index = index - 1;

	while(level <= lastLevel && index > 0) {
	  lastLevel = indentArray[--index].indent_level;
	}

	if(index === 0 & level <= lastLevel)
	{
	  return 0;
	}

	return lastLevel - level;
      }

      return -1;
    }
  },
  'end_s':
  {
    'pattern': wordRegexp(['end', ';'], true),
    'indent_offset': function(indentArray, index) {
      if(index > 0) {
	var level = indentArray[index].indent_level;
	var lastLevel = indentArray[index - 1].indent_level;
	index = index - 1;

	while(level <= lastLevel && index > 0) {
	  lastLevel = indentArray[--index].indent_level;
	}

	if(index === 0 & level <= lastLevel)
	{
	  return 0;
	}

	return lastLevel - level;
      }

      return -1;
    },
    'indent_level': function(indentArray, index) {
      if(index > 0) {
	var level = indentArray[index].indent_level;
	var lastLevel = indentArray[index - 1].indent_level;
	index = index - 1;

	while(level <= lastLevel && index > 0) {
	  lastLevel = indentArray[--index].indent_level;
	}

	if(index === 0 & level <= lastLevel)
	{
	  return 0;
	}

	return lastLevel - level;
      }

      return -1;
    }
  }
};

define([], function() {

  /* @class Renderer */
  function Renderer(color) {
    this.tokens = colorschemes[color];
  }

  Renderer.prototype.highlightLine = function(line) {
    var state = {};
    var tokens = [];
    var styleRule;

    var highlightedLine = "";

    getTokens(line, state, this.tokens, function(start, end, style) {
      tokens.push({'start': start, 'end': end, 'style': style});
    });

    tokens.forEach(function(token) {
      styleRule = this.tokens[token.style];

      if(styleRule !== undefined) {
	highlightedLine += styleRule.highlight(line.substring(token.start,
	      token.end));
      }
      else {
	highlightedLine += line.substring(token.start, token.end);
      }

    }, this);

    return highlightedLine;
  };

  Renderer.prototype.renderValue = function(runtime, val) {
    if(runtime.isPyretVal(val)) {
      if(!runtime.isNothing(val)) {
	return runtime.toReprJS(val, runtime.ReprMethods._torepr);
      }

      return '';
    }

    return String(val);
  };

  Renderer.prototype.renderValueHighlight = function(runtime, val) {
    return this.highlightLine(this.renderValue(runtime, val));
  };

  Renderer.prototype.renderName = function(name) {
    return this.tokens.name.highlight(name);
  };

  Renderer.prototype.renderType = function(type) {
    return this.tokens.type.highlight(type);
  };

  Renderer.prototype.renderError = function(error) {
    return this.tokens.error.highlight(error);
  };

  Renderer.prototype.renderLoc = function(loc) {
    return this.tokens.loc.highlight(loc);
  };

  Renderer.prototype.renderStackTrace = function(stackTrace) {
    return this.tokens.stack_trace.highlight(stackTrace);
  };

  Renderer.prototype.renderCheckSuccess = function(check) {
    return this.tokens.check_success.highlight(check);
  };

  Renderer.prototype.renderCheckFailure = function(check) {
    return this.tokens.check_failure.highlight(check);
  };

  Renderer.prototype.renderCheckNeutral = function(check) {
    return this.tokens.check_neutral.highlight(check);
  };

  Renderer.prototype.drawAndPrintAnswer = function(runtime, answer) {
    var result = this.renderValue(runtime, answer);

    if(result !== "") {
      process.stdout.write(this.highlightLine(result) + "\n");
    }
  };

  Renderer.prototype.drawSrcloc = function(runtime, s) {
    return this.renderLoc(s ? runtime.getField(s, "format").app(true) : "");
  };

  /* @class Indenter */
  function Indenter(indent) {
    this.indent = indent;
  }

  Indenter.prototype.unindent = function(indentArray) {
    var lastIndent = indentArray.shift();

    while(lastIndent && lastIndent !== Indenter.INDENT_SINGLE &&
	lastIndent !== Indenter.INDENT_DOUBLE) {
      lastIndent = indentArray.shift();
    }

    return indentArray;
  };

  Indenter.prototype.getIndentArray = function(lines, indentArray) {
    var index = -1;

    lines.forEach(function(cmd) {
      var indentType;
      var matches;
      var matched = true;

      index += 1;
      indentArray.push(
	{
	  'indent_offset': 0,
	  'indent_level': index > 0 ? indentArray[index - 1].indent_level : 0
	});

      while(matched) {
	matched = false;

	for(indentType in indents) {
	  if(indents.hasOwnProperty(indentType)) {
	    matches = cmd.match(indents[indentType].pattern);

	    if(matches) {
	      indentArray[index].indent_offset += indents[indentType].indent_offset;
	      indentArray[index].indent_level = indents[indentType].indent_level(indentArray, index);
	      cmd = cmd.eat(matches[0]);
	      matched = true;
	    }
	  }
	}
      }
    });

    return indentArray;
  };

  Indenter.prototype.getIndent = function(indentArray, index) {
    var repeat = Math.max(indentArray[index].indent_level + indentArray[index].indent_offset, 0);
    return this.indent.repeat(repeat);
  };

  return {
    Renderer : Renderer,
    Indenter : Indenter
  };
});
