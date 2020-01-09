/*
 * Copyright (c) 2019, Two Sigma Open Source
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

/**
 * This module contains methods for implementing the `merge-bare` command.
 */

/**
 * help text for the `merge` command
 * @property {String}
 */
exports.helpText = `merge two commits with no need for a working directory, \
print resulting merged commit sha`;

/**
 * description of the `merge` command
 * @property {String}
 */
exports.description =` Merge changes from two commits.  This command
can work with or without a working tree, resulting a dangling merged commit
that is not pointed by any refs. It will also abort if there are merge conflicts
 between two commits.`;

exports.configureParser = function (parser) {
    parser.addArgument(["-m", "--message"], {
        type: "string",
        help: "commit message",
        required: true,
    });

    parser.addArgument(["ourCommit"], {
        type: "string",
        help: "our side commitish to merge",
    });
    parser.addArgument(["theirCommit"], {
        type: "string",
        help: "their side commitish to merge",
    });

    parser.addArgument(["--no-ff"], {
        help: "create a merge commit even if fast-forwarding is possible",
        action: "storeConst",
        constant: true,
    });
};

/**
 * Execute the `merge_bare` command according to the specified `args`.
 *
 * @async
 * @param {Object} args
 * @param {String} args.commit
 */
exports.executeableSubcommand = co.wrap(function *(args) {

    const colors = require("colors");

    const MergeUtil      = require("../util/merge_util");
    const MergeCommon    = require("../util/merge_common");
    const GitUtil        = require("../util/git_util");
    const Hook           = require("../util/hook");
    const Open           = require("../util/open");
    const UserError      = require("../util/user_error");

    const repo = yield GitUtil.getCurrentRepo();
    const mode = args.no_ff ?
        MergeCommon.MODE.FORCE_COMMIT :
        MergeCommon.MODE.NORMAL;
    let ourCommitName = args.ourCommit;
    let theirCommitName = args.theirCommit;
    if (null === ourCommitName || null === theirCommitName) {
        throw new UserError("Two commits must be given.");
    }
    const ourCommitish = yield GitUtil.resolveCommitish(repo, ourCommitName);
    if (null === ourCommitish) {
        throw new UserError(`\
Could not resolve ${colors.red(ourCommitName)} to a commit.`);
    }

    const theirCommitish
        = yield GitUtil.resolveCommitish(repo, theirCommitName);
    if (null === theirCommitish) {
        throw new UserError(`\
Could not resolve ${colors.red(theirCommitName)} to a commit.`);
    }

    const ourCommit = yield repo.getCommit(ourCommitish.id());
    const theirCommit = yield repo.getCommit(theirCommitish.id());
    const noopEditor = function() {};
    const result = yield MergeUtil.merge(repo,
                                         ourCommit,
                                         theirCommit,
                                         mode,
                                         Open.SUB_OPEN_OPTION.FORCE_BARE,
                                         args.message,
                                         noopEditor);
    if (null !== result.errorMessage) {
        throw new UserError(result.errorMessage);
    }
    if (null !== result.metaCommit) {
        console.log(result.metaCommit);
    }
    // Run post-merge hook if merge successfully.
    // Fixme: --squash is not supported yet, once supported, need to parse 0/1
    // as arg into the post-merge hook, 1 means it is a squash merge, 0 means
    // not.
    yield Hook.execHook(repo, "post-merge", ["0"]);
});
