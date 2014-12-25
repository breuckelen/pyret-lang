/*global define */
/*jslint unparam: true, todo: true, node: true*/

/*TODO:
 * Make sure that the renderer has a type for errors, and that they are rendered accordingly, stack traces, etc.
 */
define(["js/ffi-helpers", "trove/srcloc", "trove/error", "trove/contracts", "compiler/compile-structs.arr"], function(ffiLib, srclocLib, errorLib, contractsLib, csLib) {
  function drawError(runtime, exception) {
    var ffi = ffiLib(runtime, runtime.namespace);
    var cases = ffi.cases;
    var get = runtime.getField;

    return runtime.loadModules(runtime.namespace, [srclocLib, errorLib, contractsLib, csLib], function(srcloc, error, contracts, cs) {
      function makePred(ns, funName) {
	return get(ns, funName).app;
      }

      //TODO: move to output-ui
      function renderValue(val) {
	if(runtime.isPyretVal(val)) {
	  return runtime.toReprJS(val, "_torepr");
	}
	return String(val);
      }

      var isSrcloc = function(s) {
	return runtime.unwrap(get(srcloc, "is-srcloc").app(s));
      };
      var isContractError = makePred(contracts, "ContractResult");
      var isParseError = makePred(error, "ParseError");
      var isRuntimeError = makePred(error, "RuntimeError");

      //TODO: Move to output-ui
      function drawSrcloc(s) {
	return s ? get(s, "format").app(true) : "";
      }

      function drawCompileErrors(e) {
	function drawUnboundId(idExpr) {
	  var name = get(get(idExpr, "id"), "toname").app();
	  var loc = get(idExpr, "l");

	  return cases(get(srcloc, "Srcloc"), "Srcloc", loc, {
	    "builtin": function(_) {
	      return "Should not be allowed to have a builtin that's unbound"
		+ String(e);
	    },
	    "srcloc": function(source, startL, startC, startCh, endL, endC, endCh) {
	      return "The name '"
		+ name
		+ "' is used but not defined at\n"
		+ drawSrcloc(loc);
	    }
	  });
	}

	//Question(ben) why does this function accept different arguments?
	function drawUnboundVar(id, loc) {
	  return cases(get(srcloc, "Srcloc"), "Srcloc", loc, {
	    "builtin": function(_) {
	      return "Should not be allowed to have a builtin that's unbound"
		+ String(e);
	    },
	    "srcloc": function(source, startL, startC, startCh, endL, endC, endCh) {
	      return "The variable '"
		+ id
		+ "' is assigned to, but not defined, at\n"
		+ drawSrcloc(loc);
	    }
	  });
	}

	function drawUnboundTypeId(idExpr) {
	  var name = get(get(idExpr, "id"), "toname").app();
	  var loc = get(idExpr, "l");

	  return cases(get(srcloc, "Srcloc"), "Srcloc", loc, {
	    "builtin": function(_) {
	      return "Should not be allowed to have a builtin that's unbound"
		+ String(e);
	    },
	    "srcloc": function(source, startL, startC, startCh, endL, endC, endCh) {
	      return "The name '"
		+ name
		+ "' is used as a type but not defined as one, at\n"
		+ drawSrcloc(loc);
	    }
	  });
	}

	function drawShadowId(id, newLoc, oldLoc) {
	  return cases(get(srcloc, "Srcloc"), "Srcloc", oldLoc, {
	    "builtin": function(_) {
	      return "The name '"
		+ id
		+ "' is already defined. You need to pick a different name for '"
		+ id
		+ "' at\n"
		+ drawSrcloc(newLoc);
	    },
	    //NOTE(ben) this is unecessary
	    "srcloc": function(source, startL, startC, startCh, endL, endC, endCh) {
	      return "It looks like you defined the name '"
		+ id
		+ "' twice, at\n"
		+ drawSrcloc(oldLoc) + "\n"
		+ drawSrcloc(newLoc) + "\n"
		+ "You need to pick a new name for one of them";
	    }
	  });
	}

	function drawPointlessVar(loc) {
	  return cases(get(srcloc, "Srcloc"), "Srcloc", loc, {
	    "builtin": function(_) {
	      return "Should not be possible to have a builtin var that's anonymous"
		+ String(e);
	    },
	    "srcloc": function(source, startL, startC, startCh, endL, endC, endCh) {
	      return "Defining anonymous variables is pointless: you have no name to modify. "
		+ "Either give this expression a name, or bind it to an identifier rather than a variable.\n\n"
		+ drawSrcloc(loc);
	    }
	  });
	}

	function drawPointlessShadow(loc) {
	  return cases(get(srcloc, "Srcloc"), "Srcloc", loc, {
	    "builtin": function(_) {
	      return "Should not be possible to have a builtin var that's anonymous"
		+ String(e);
	    },
	    "srcloc": function(source, startL, startC, startCh, endL, endC, endCh) {
	      return "Anonymous identifiers cannot shadow anything: there is no name to shadow. "
		+ "Either give this expression a name, or remove the shadow annotation.\n\n"
		+ drawSrcloc(loc);
	    }
	  });
	}

	function drawPointlessRec(loc) {
	  return cases(get(srcloc, "Srcloc"), "Srcloc", loc, {
	    "builtin": function(_) {
	      return "Should not be possible to have a builtin var that's anonymous"
		+ String(e);
	    },
	    "srcloc": function(source, startL, startC, startCh, endL, endC, endCh) {
	      return "The anonymous recursive identifier at "
		+ drawSrcloc(loc)
		+ " can never be re-used";
	    }
	  });
	}

	function drawWfError(msg, loc) {
	  return msg + "\n" + drawSrcloc(loc);
	}

	function drawWfErrSplit(msg, locs) {
	  var s = msg;
	  var locArray = ffi.toArray(locs);
	  locArray.forEach(function(l) {
	   s += "\n" + drawSrcloc(l);
	  });
	  return s;
	}

	function drawReservedName(loc, id) {
	  return "Well-formedness: Pyret disallows the use of '"
	    + id
	    + "' as an identifier\n"
	    + drawSrcloc(loc);
	}

	function drawErrorToString(e) {
	  return function() {
	    runtime.safeCall(function() {
		return runtime.toReprJS(e, "tostring");
	      }, function(s) {
		return s;
	      });
	  };
	}

	function drawCompileError(e) {
	  return cases(get(cs, "CompileError"), "CompileError", e, {
	    "unbound-id": drawUnboundId,
	    "unbound-var": drawUnboundVar,
	    "unbound-type-id": drawUnboundTypeId,
	    "shadow-id": drawShadowId,
	    "duplicate-id": drawShadowId,
	    "duplicate-field": drawShadowId,
	    "pointless-var": drawPointlessVar,
	    "pointless-shadow": drawPointlessShadow,
	    "pointless-rec": drawPointlessRec,
	    "wf-err": drawWfError,
	    "wf-err-split": drawWfErrSplit,
	    "reserved-name": drawReservedName,
	    "else": drawErrorToString(e)
	  });
	}

	if(e.length  !== 1) {
	  var msg = "";
	  e.forEach(function(e) {
	    msg += drawCompileError(e) + "\n\n";
	  });
	  return msg;
	}

	return drawCompileError(e[0]);
      }

      function drawStackTrace(e) {
        var srclocStack = e.pyretStack.map(runtime.makeSrcloc);
        var userLocs = srclocStack.filter(function(l) {
	  return l && isSrcloc(l);
	});
        if(userLocs.length > 0) {
	  var msg = "Stack trace:";
          userLocs.forEach(function(ul) {
	    msg += "\n" + drawSrcloc(ul);
          });
	  return msg;
        }

	return "";
      }

      function getLastUserLocation(e, ix) {
        var srclocStack = e.pyretStack.map(runtime.makeSrcloc);
        var userLocs = srclocStack.filter(function(l) {
          if(!(l && isSrcloc(l))) { return false; }
          var source = runtime.getField(l, "source");
          return (source === "definitions"
	    || source.indexOf("interactions") !== -1
	    || source.indexOf("gdrive") !== -1);
        });

        var probablyErrorLocation = userLocs[ix];
        return probablyErrorLocation;
      }

      function drawPyretException(e) {
	function drawRuntimeError(e) {
	  return function() {
	    renderValue(e.exn);
	  };
	}

	function drawGenericTypeMismatch(value, type) {
          // TODO(joe): How to improve this search?
          var probablyErrorLocation = getLastUserLocation(e, 0);
	  return "Expected to get a "
	    + type
	    + " as an argument, but got this instead:\n"
	    + renderValue(value)
	    + "\nat\n"
	    + drawSrcloc(probablyErrorLocation);
        }

	function drawCasesArityMismatch(branchLoc, numArgs, actualArity) {
	  return "The cases branch at\n"
	    + drawSrcloc(branchLoc)
	    + "\nshould have only " + actualArity
	    + " arguments, but there are " + numArgs;
        }

	function drawCasesSingletonMismatch(branchLoc, shouldBeSingleton) {
	  var msg = "The cases branch at\n" + drawSrcloc(branchLoc);
          if(shouldBeSingleton) {
	    msg += "\nhas an argument list, but the variant is a singleton";
          }
	  else {
	    msg += "\ndoesn't have an argument list, but the variant is not a singleton";
          }
	  return msg;
        }

        function drawArityMismatch(funLoc, arity, args) {
          var argsList = ffi.toArray(args);
          var probablyErrorLocation = getLastUserLocation(e, 0);
	  var argsText = "";
	  argsList.forEach(function(a) {
	    argsText += "\n" + renderValue(a);
	  });
          return cases(get(srcloc, "Srcloc"), "Srcloc", funLoc, {
            "srcloc": function() {
              var caller = drawSrcloc(probablyErrorLocation);
              var callee = drawSrcloc(funLoc);
              return "Expected to get "
		+ arity
		+ " arguments when calling the function at\n"
		+ callee
		+ "\nfrom\n"
		+ caller
		+ "\nbut got these "
		+ argsList.length + " arguments: "
		+ argsText;
            },
            "builtin": function(name) {
              var caller = drawSrcloc(probablyErrorLocation);
              return "Expected to get "
		+ arity
		+ " at\n"
		+ caller
		+ "\nbut got these "
		+ args.length + " arguments: "
		+ argsText;
	    }
          });
        }

	function drawMessageException(message) {
          var probablyErrorLocation = getLastUserLocation(e, 0);
	  var msg = "";
          if(probablyErrorLocation !== undefined) {
	    msg += " At:\n" + drawSrcloc(probablyErrorLocation);
          } else {
	    msg = message;
          }
	  return msg;
        }

	//Note(ben) not sure when this arises
	function drawUninitializedId(loc, name) {
	  return "The name '"
	    + name
	    + "' was used at\n"
	    + drawSrcloc(loc)
	    + "\nbefore it was defined";
	}

	function drawNoBranchesMatched(loc, type) {
	  return "No cases matched in e "
	    + type
	    + " expression at\n"
	    + drawSrcloc(loc) + "\n\n"
	    + drawStackTrace(e);
        }

	function drawNoCasesMatched(loc, value) {
	  return "No cases matched in the cases expression at \n"
	    + drawSrcloc(loc)
	    + "\nfor the value:\n"
	    + renderValue(value) + "\n\n"
	    + drawStackTrace(e);
        }

	//Note(ben) when are the next two triggered?
	function drawNonBooleanCondition(loc, type, value) {
	  return "Expected true for false for the test in an "
	    + type
	    + " expression, but got:\n"
	    + renderValue(value)
	    + "\nat\n"
	    + drawSrcloc(loc);
        }

	function drawNonBooleanOp(loc, position, type, value) {
	  return "Expected true or false for the "
	    + position
	    + " argument in "
	    + type
	    + " expression, but got:\n"
	    + renderValue(value)
	    + "\nat\n"
	    + drawSrcloc(loc);
        }

	function drawNonFunctionApp(loc, nonFunVal) {
	  return "Expected a function in application but got:\n"
	    + renderValue(nonFunVal)
	    + "\nat\n"
	    + drawSrcloc(loc);
        }

	//Note(ben) can / will this be used in the repl?
	function drawUserBreak() {
	  return "Program stopped by user";
	}

	function drawFieldNotFound(loc, obj, field) {
	  return "Field '"
	    + field
	    + "' not found in the lookup expression at\n"
	    + drawSrcloc(loc)
	    + "\nThe object was:\n"
	    + renderValue(obj) + "\n\n"
	    + drawStackTrace(e);
        }

	function drawLookupNonObject(loc, nonObj, field) {
	  return "Tried to look up field '"
	    + field
	    + "' on a non-object in the lookup expression at\n"
	    + drawSrcloc(loc)
	    + "\nThe non-object was:\n"
	    + renderValue(nonObj) + "\n\n"
	    + drawStackTrace(e);
        }

	function drawExtendNonObject(loc, nonObj) {
	  return "Tried to extend a non-object in the expression at\n"
	    + drawSrcloc(loc)
	    + "\nThe non-object was:\n"
	    + renderValue(nonObj) + "\n\n"
	    + drawStackTrace(e);
        }

	function drawInvalidArrayIndex(methodName, array, index, reason) {
          var probablyErrorLocation = getLastUserLocation(e, 0);
	  return "Invalid aray index "
	    + index
	    + " around the function call at\n"
	    + drawSrcloc(probablyErrorLocation) + "\n\n"
	    + drawStackTrace(e);
        }

	//Note(ben) how to test this?
	function drawModuleLoadFailure(names) {
          var arr = runtime.ffi.toArray(names);
	  return "The module(s) "
	    + arr.join(", ")
	    + " failed to load";
        }

	//Note(ben) why is this different from the one below?
	function drawPlusError(val1, val2) {
	  return "Invalid use of + for these values:\n"
	    + renderValue(val1) + "\n"
	    + renderValue(val2) + "\n"
	    + "Plus takes one of:\n"
	    + "  - Two strings\n"
	    + "  - Two numbers\n"
	    + "  - A left-hand side with a _plus method\n\n"
	    + drawStackTrace(e);
        }

	function drawNumericBinopError(val1, val2, opname, methodname) {
	  return "Invalid use of "
	    + opname
	    + " for these values:\n"
	    + renderValue(val1) + "\n"
	    + renderValue(val2) + "\n"
	    + "Either:\n"
	    + "  - Both arguments must be numbers, or\n"
	    + "  - The left-hand side must have a "
	    + methodname
	    + " method\n\n"
	    + drawStackTrace(e);
        }

        function drawPyretRuntimeError() {
          return cases(get(error, "RuntimeError"), "RuntimeError", e.exn, {
	    "message-exception": drawMessageException,
	    "uninitialized-id": drawUninitializedId,
	    "no-branches-matched": drawNoBranchesMatched,
	    "no-cases-matched": drawNoCasesMatched,
	    "field-not-found": drawFieldNotFound,
	    "lookup-non-object": drawLookupNonObject,
	    "extend-non-object": drawExtendNonObject,
	    "generic-type-mismatch": drawGenericTypeMismatch,
	    "arity-mismatch": drawArityMismatch,
	    "cases-arity-mismatch": drawCasesArityMismatch,
	    "cases-singleton-mismatch": drawCasesSingletonMismatch,
	    "plus-error": drawPlusError,
	    "numeric-binop-error": drawNumericBinopError,
	    "non-boolean-condition": drawNonBooleanCondition,
	    "non-boolean-op": drawNonBooleanOp,
	    "non-function-app": drawNonFunctionApp,
	    "module-load-failure": drawModuleLoadFailure,
	    "invalid-array-index": drawInvalidArrayIndex,
	    "user-break": drawUserBreak,
	    "else": drawRuntimeError(e)
	  });
	}

        function drawParseErrorNextToken(loc, nextToken) {
          var explanationMissing = "The program is missing something\n"
	    + "Look carefully around the location. Is something missing just before it?  Common missing items are colons ':', commas ',', string markers '\"', and keywords.\n"
            + "Usually, inserting the missing item will fix this error";
          var explanationExtra = "The program contains something extra\n"
	    + "Look carefully around the location. Does it contains something extra?  A common source of errors is typing too much text or in the wrong order.\n"
            + "Usually, removing the extra item will fix this error. However, you may have meant to keep this text, so think before you delete!";
          var explanation = "Typical reasons for getting this error are\n1)\n"
	    + explanationMissing
	    + "\n2)\n"
	    + explanationExtra;

	  return "Pyret didn't understand your program around\n"
	    + drawSrcloc(loc) + "\n"
	    + explanation;
        }

        function drawParseErrorUnterminatedString(loc) {
          return "Pyret thinks your program has an incomplete string literal around\n"
	    + drawSrcloc(loc)
	    + "\n you may be missing closing punctuation.";
        }

        function drawParseErrorEOF(loc) {
          return "Pyret didn't understand the very end of your program.  You may be missing an \"end\", or closing punctuation like \")\" or \"]\", right at the end.";
        }

        // NOTE(joe 8 Aug 2014): The underscore is a location that is
        // currently always a builtin location, because of how set-ref works
        function drawRefInit(isArg, _) {
          return function(annLoc, reason) {
            var probablyErrorLocation = getLastUserLocation(e, 0);
            var nestedFailure = ffi.contractFail(annLoc, reason);
            var nestedExn = runtime.makePyretFailException(nestedFailure);

	    return "Failed while initializing a graph at "
	      + drawSrcloc(probablyErrorLocation)
	      + " because:\n"
	      + drawError(runtime, nestedExn) + "\n\n"
	      + drawStackTrace(e);
          };
        }

	//Note(ben) what does isArg do?
        function drawTypeMismatch(isArg, loc) {
          return function(val, name) {
            var probablyErrorLocation = getLastUserLocation(e, 0);
	    return "Expected to get '"
	      + name
	      + "' because of the annotation at\n"
	      + drawSrcloc(loc)
	      + "\nbut got:\n"
	      + renderValue(val)
	      + "\ncalled from around\n"
	      + drawSrcloc(probablyErrorLocation) + "\n\n"
	      + drawStackTrace(e);
          };
        }

        function drawPredicateFailure(isArg, loc) {
          return function(val, predName) {
            var probablyErrorLocation = getLastUserLocation(e, 0);
	    return "The predicate '"
	      + predName
	      + "' in the annotation at\n"
	      + drawSrcloc(loc)
	      + "\nreturned false for this value:\n"
	      + renderValue(val)
	      + "\ncalled from around\n"
	      + drawSrcloc(probablyErrorLocation) + "\n\n"
	      + drawStackTrace(e);
          };
        }

        function drawRecordFieldsFail(isArg, loc) {
          return function(val, fieldFailures) {
	    return "The record annation at\n"
	      + drawSrcloc(loc)
	      + "\nfailed on this value:\n"
	      + renderValue(val);
          };
        }

        function drawDotAnnNotPresent(isArg, loc) {
          return function(name, field) {
	    return "Couldn't find the annotation named '"
	      + field
	      + "' at\n"
	      + drawSrcloc(loc)
	      + "\nin the annotations from '"
	      + name
	      + "'";
          };
        }

        function drawPyretContractFailure(err) {
          var isArg = ffi.isFailArg(err);
          var loc = get(err, "loc");
          var reason = get(err, "reason");
          return cases(get(contracts, "FailureReason"), "FailureReason", reason, {
              "type-mismatch": drawTypeMismatch(isArg, loc),
              "ref-init": drawRefInit(isArg, loc),
              "predicate-failure": drawPredicateFailure(isArg, loc),
              "record-fields-fail": drawRecordFieldsFail(isArg, loc),
              "dot-ann-not-present": drawDotAnnNotPresent(isArg, loc)
            });
        }

        function drawPyretParseError() {
          return cases(get(error, "ParseError"), "ParseError", e.exn, {
              "parse-error-next-token": drawParseErrorNextToken,
              "parse-error-eof": drawParseErrorEOF,
              "parse-error-unterminated-string": drawParseErrorUnterminatedString,
              "else": drawRuntimeError(e)
            });
        }

        if(!runtime.isObject(e.exn)) {
          return drawRuntimeError(e)();
        }

	if(isContractError(e.exn)) {
          return drawPyretContractFailure(e.exn);
        }

        if(isRuntimeError(e.exn)) {
          return drawPyretRuntimeError();
        }

	if(isParseError(e.exn)) {
          return drawPyretParseError();
        }

	return drawRuntimeError(e)();
      }

      function drawUnknownException(e) {
	return "An unexpected error occurred: " + String(e);
      }

      //TODO: Change rendering strategies
      if(exception instanceof Array) {
	return drawCompileErrors(exception);
      }

      if(exception.exn instanceof Array) {
	return drawCompileErrors(exception.exn);
      }

      if(runtime.isPyretException(exception)) {
	return drawPyretException(exception);
      }

      return drawUnknownException(exception);
    });
  }

  return {
    drawError: drawError
  };
});
