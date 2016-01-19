/*global define */
/*jslint unparam: true, node: true*/

var r = require("requirejs");

r.config({
  paths: {
    trove: "../../build/phase1/trove",
    js: "../../build/phase1/js",
    compiler: "../../build/phase1/arr/compiler"
  }
});

r(["q", "js/repl-lib", "js/runtime-anf", "compiler/compile-structs.arr", "./input-ui", "./output-ui", "./error-ui", "./check-ui"], function(Q, replLib, runtimeLib, csLib, inputLib, outputUI, errorUI, checkUI) {
  var runtime = runtimeLib.makeRuntime({});
  var inputUI = inputLib(runtime);
  var renderer = new outputUI.Renderer('default');
  var get = runtime.getField;

  runtime.loadModules(runtime.namespace, [csLib], function(cs) {
    var sb = get(cs, "standard-builtins");
    var repl = replLib.create(runtime, runtime.namespace, sb, { name: "repl-cli", dialect: "Pyret"});
    var resultPromise = repl.restartInteractions("");

    inputUI.on("command", function(cmd) {
      inputUI.setListening(false);

      resultPromise.then(function(_) {
	return repl.run(cmd, "interactions" + inputUI.getPromptNumber());
      }).then(function(res) {
	try {
	  if(runtime.isSuccessResult(res)) {
	    renderer.drawAndPrintAnswer(runtime, get(res.result, "answer"));
	    checkUI.drawAndPrintCheckResults(runtime, get(res.result, "checks"));
	  }
	  else {
	    var exception = res.exn;
	    errorUI.drawAndPrintError(runtime, exception);
	  }
	  
	  inputUI.prompt();
	} catch(e) {
	  console.error("Interactions stopped due to error: " + e.stack);
	  process.exit(1);
	}

	inputUI.setListening(true);
      });
    }).on('close', function() {
      process.exit(0);
    });

    inputUI.prompt();
  });
});