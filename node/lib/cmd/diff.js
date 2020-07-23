/*
 * Copyright (c) 2020, Two Sigma Open Source
 * All rights reserved.
 *
 * Redistribution and use in source and binary forms, with or without
 * modification, are permitted provided that the following conditions are met:
 *
 * * Redistributions of source code must retain the above copyright notice,
 *   this list of conditions and the following disclaimer.
 *
 * * Redistributions in binary form must reproduce the above copyright notice,
 *   this list of conditions and the following disclaimer in the documentation
 *   and/or other materials provided with the distribution.
 *
 * * Neither the name of git-meta nor the names of its
 *   contributors may be used to endorse or promote products derived from
 *   this software without specific prior written permission.
 *
 * THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS"
 * AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE
 * IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE
 * ARE DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT HOLDER OR CONTRIBUTORS BE
 * LIABLE FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR
 * CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF
 * SUBSTITUTE GOODS OR SERVICES; LOSS OF USE, DATA, OR PROFITS; OR BUSINESS
 * INTERRUPTION) HOWEVER CAUSED AND ON ANY THEORY OF LIABILITY, WHETHER IN
 * CONTRACT, STRICT LIABILITY, OR TORT (INCLUDING NEGLIGENCE OR OTHERWISE)
 * ARISING IN ANY WAY OUT OF THE USE OF THIS SOFTWARE, EVEN IF ADVISED OF THE
 * POSSIBILITY OF SUCH DAMAGE.
 */
"use strict";

const co = require("co");
const { processRebase } = require("../util/submodule_rebase_util");

/**
 * This module contains methods for implementing the `rm` command.
 */

/**
 * help text for the `rm` command
 * @property {String}
 */
exports.helpText = `Show changes between commits.`;

/**
 * description of the `rm` command
 * @property {String}
 */
exports.description =`Show changes between two meta commits`;

exports.configureParser = function (parser) {

    parser.addArgument(["--cached", "--staged"], {
        dest: "cached",
        required: false,
        action: "storeConst",
        constant: true,
        help: "View staged changes.",
        defaultValue:false
    });

    parser.addArgument(["--no-index"], {
        required: false,
        action: "storeConst",
        constant: true,
        help: "do not use index data in diff at all.",
        defaultValue:false
    });


    parser.addArgument(["--name-only"], {
        required: false,
        action: "storeConst",
        constant: true,
        help: "Show only names of changed files.",
        defaultValue:false
    });

    parser.addArgument(["--name-status"], {
        required: false,
        action: "storeConst",
        constant: true,
        help: `Show only names and status of changed files.`,
        defaultValue: false,
    });

    parser.addArgument(["--raw"], {
        required: false,
        action: "storeConst",
        constant: true,
        help: `Produce a patch file.`,
        defaultValue: false,
    });    

    parser.addArgument("commits", {
        require: false,
        target: "commits",
        nargs: "*",
        help: "commit-a commit-b"
    });

    parser.addArgument("paths", {
        require: false,
        target: "paths",
        nargs: "*",
        help: "commit-a commit-b"
    });
};


const getOpts = function (args) {
    const opts = {
        diffOpts: NodeGi
    };
};

/**
 * Execute the `rm` command according to the specified `args`.
 *
 * @async
 * @param {Object}   args
 * @param {String[]} args.paths
 */
exports.executeableSubcommand = co.wrap(function *(args) {
    const DiffUtil      = require("../util/diff_util");
    const GitUtil       = require("../util/git_util");
    const Open          = require("../util/open");
    const SubmoduleUtil = require("../util/submodule_util");
    
    const repo          = yield GitUtil.getCurrentRepo();
    const opts          = yield DiffUtil.getOptions(repo, args);
    const metaDiff      = yield DiffUtil.getDiffWithOptions(repo, opts);
    const treeChanges   = yield SubmoduleUtil.getSubmoduleChangesFromDiff(metaDiff, true);
    const opener        = new Open.Opener(repo, null);
    for (let subName in treeChanges) {
        const subRepo = yield opener.getSubrepo(
            subName,
            Open.SUB_OPEN_OPTION.FORCE_OPEN
        );
        yield DiffUtil.printDiff(repo, subRepo, opts);
    }
    console.log(JSON.stringify({
        msg: "debug",
        opts: opts,
        treeChanges: treeChanges,
        argv: process.argv,
    }, null, 2));


    /* const GitUtil = require("../util/git_util");
    const repo    = yield GitUtil.getCurrentRepo();
    const workdir = repo.workdir();
    const cwd     = process.cwd();

    const paths = yield args.paths.map(filename => {
        return  GitUtil.resolveRelativePath(workdir, cwd, filename);
    });
    yield Rm.rmPaths(repo, paths, args); */
});
