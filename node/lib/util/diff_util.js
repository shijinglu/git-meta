/*
 * Copyright (c) 2017, Two Sigma Open Source
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

const assert  = require("chai").assert;
const co      = require("co");
const spawn   = require("child-process-promise").spawn;

const NodeGit             = require("nodegit");
const RepoStatus          = require("./repo_status");
const SubmoduleConfigUtil = require("./submodule_config_util");
const TreeUtil            = require("./tree_util");

const DELTA = NodeGit.Diff.DELTA;

/**
 * Return the `RepoStatus.FILESTATUS` value that corresponds to the specified
 * flag.  The behavior is undefined unless `flag` represents one of the types
 * convertible to `FILESTATUS`.
 *
 * @param {NodeGit.Diff.DELTA} flag
 * @return {RepoStatus.FILESTATUS}
 */
exports.convertDeltaFlag = function (flag) {
    const FILESTATUS = RepoStatus.FILESTATUS;
    switch (flag) {
        case DELTA.MODIFIED: return FILESTATUS.MODIFIED;
        case DELTA.ADDED: return FILESTATUS.ADDED;
        case DELTA.DELETED: return FILESTATUS.REMOVED;
        case DELTA.RENAMED: return FILESTATUS.RENAMED;
        case DELTA.TYPECHANGE: return FILESTATUS.TYPECHANGED;

        // Status changes in `RepoStatus` objects are separated into `staged`
        // and `workdir` maps.  Files that are "added" in the workdir are
        // implicitly untracked.

        case DELTA.UNTRACKED: return FILESTATUS.ADDED;
    }
    assert(false, `Unrecognized DELTA type: ${flag}.`);
};

function readDiff(diff) {
    const result = {};
    const FILESTATUS = RepoStatus.FILESTATUS;
    const numDeltas = diff.numDeltas();
    for (let i = 0;  i < numDeltas; ++i) {
        const delta = diff.getDelta(i);
        const diffStatus = delta.status();
        if (DELTA.CONFLICTED === diffStatus) {
            continue;                                               // CONTINUE
        }
        const fileStatus = exports.convertDeltaFlag(diffStatus);
        const file = FILESTATUS.REMOVED === fileStatus ?
                     delta.oldFile() :
                     delta.newFile();
        const path = file.path();

        // Skip the .gitmodules file and all submodule changes; they're handled
        // separately.

        if (SubmoduleConfigUtil.modulesFileName !== path &&
            NodeGit.TreeEntry.FILEMODE.COMMIT !== file.mode()) {
            result[path] = fileStatus;
        }
    }
    return result;
}

/**
 * Do not use this on the meta repo because it uses libgit2 operations
 * with bad performance and without the ability to handle sparse checkouts.
 *
 * Return differences for the specified `paths` in the specified `repo` between
 * the current index and working directory, and the specified `tree`, if
 * not null.  If the specified `allUntracked` is true, include all untracked
 * files rather than accumulating them by directory.  If `paths` is empty,
 * check the entire `repo`.  If the specified `ignoreIndex` is true,
 * return, in the `workdir` field, the status difference between the workdir
 * and `tree`, ignoring the state of the index.  Otherwise, return, in the
 * `workdir` field, the difference between the workir and the index; and in the
 * `staged` field, the difference between the index and `tree`.  Note that when
 * `ignoreIndex` is true, the returned `staged` field will always be `{}`.
 * Note also that conflicts are ignored; we don't have enough information here
 * to handle them properly.
 *
 * @param {NodeGit.Repository} repo
 * @param {NodeGit.Tree|null} tree
 * @param {String []} paths
 * @param {Boolean} ignoreIndex
 * @param {Boolean} allUntracked
 * @return {Object}
 * @return {Object} return.staged path to FILESTATUS of staged changes
 * @return {Object} return.workdir path to FILESTATUS of workdir changes
 */
exports.getRepoStatus = co.wrap(function *(repo,
                                           tree,
                                           paths,
                                           ignoreIndex,
                                           allUntracked) {
    assert.instanceOf(repo, NodeGit.Repository);
    if (null !== tree) {
        assert.instanceOf(tree, NodeGit.Tree);
    }
    assert.isArray(paths);
    assert.isBoolean(ignoreIndex);
    assert.isBoolean(allUntracked);

    const options = {
        ignoreSubmodules: 1,
        flags: NodeGit.Diff.OPTION.INCLUDE_UNTRACKED |
               NodeGit.Diff.OPTION.EXCLUDE_SUBMODULES,
    };
    if (0 !== paths.length) {
        options.pathspec = paths;
    }
    if (allUntracked) {
        options.flags = options.flags |
                        NodeGit.Diff.OPTION.RECURSE_UNTRACKED_DIRS;
    }
    if (ignoreIndex) {
        const workdirToTreeDiff =
                   yield NodeGit.Diff.treeToWorkdir(repo, tree, options);
        const workdirToTreeStatus = readDiff(workdirToTreeDiff);
        return {
            staged: {},
            workdir: workdirToTreeStatus,
        };
    }
    const index = yield repo.index();
    const workdirToIndexDiff =
                       yield NodeGit.Diff.indexToWorkdir(repo, index, options);
    const workdirToIndexStatus = readDiff(workdirToIndexDiff);
    const indexToTreeDiff =
            yield NodeGit.Diff.treeToIndex(repo, tree, null, options);
    const indexToTreeStatus = readDiff(indexToTreeDiff);
    return {
        staged: indexToTreeStatus,
        workdir: workdirToIndexStatus,
    };
});

exports.getOptions = co.wrap(function *(repo, args) {
    assert.instanceOf(repo, NodeGit.Repository);

    const opts = {
        diffOpts: new NodeGit.DiffOptions(),
        treeish1: null,
        treeish1: null,
        t1: null,
        t2: null,
        argOpts: [],
        argPaths: [],
    };
    let i0 = process.argv.indexOf("diff");
    i0 = (i0 === -1) ? 0 : i0;
    let i1 = process.argv.indexOf("--");
    i1 = (i1 === -1) ? process.argv.length : i1;
    
    const argOpts = process.argv.slice(i0 + 1, i1);
    const argPaths = process.argv.slice(i1 + 1, process.argv.length);
    if (args.commits && args.commits.length) {
        const treeish1 = args.commits[0];
        if (!argPaths.includes(treeish1)) {
            opts.treeish1 = treeish1;
            if (args.commits.length > 1) {
                const treeish2 = args.commits[1];
                if (!argPaths.includes(treeish2)) {
                    opts.treeish2 = treeish2;
                }
            }
        }
    }
    opts.argOpts = argOpts.filter(w => (w !== opts.treeish1) && ((w !== opts.treeish2)) );
    opts.argPaths = argPaths;
    opts.t1 = yield TreeUtil.revparseTreeish(repo, opts.treeish1);
    opts.t2 = yield TreeUtil.revparseTreeish(repo, opts.treeish2);
    return opts;
});

const subDiffCmdBuilder = co.wrap(function *(metaRepo, subRepo, opts) {
    const path      = require("path");
    const metaDir   = metaRepo.workdir();
    const subDir    = subRepo.workdir();
    const subPath   = path.relative(metaDir, subDir);
    const argOpts   = opts.argOpts;
    const argPaths  = opts.argPaths;
    let treeishStr  = "";
    if(argPaths && argPaths.length > 0) {
        const relativePaths = argPaths.map(p => {
            const relative = path.relative(subPath, p);
            if (relative.startsWith("..")) {
                return null;
            } else if (relative === "") {
                return ".";
            }
            return relative;
        }).filter(p => p !== null);
        if (relativePaths.length === 0) {
            return "";
        }
        return `git -C ${subPath} diff ${argOpts.join(" ")} ${treeishStr} -- ${relativePaths.join(" ")}`;
    }
    return `git -C ${subPath} diff ${argOpts.join(" ")} ${treeishStr}`;
});

exports.getDiffWithOptions = co.wrap(function *(repo, opts) {
    assert.instanceOf(repo, NodeGit.Repository);
    const {diffOpts, t1, t2} = opts;
    let diff = null;
    if (t1 && t2) {
        diff = yield NodeGit.Diff.treeToTree(repo, t1, t2, diffOpts);
    } else if (t1) {
        diff = yield NodeGit.Diff.treeToWorkdirWithIndex(repo, t1, null, diffOpts);
    }  else {
        diff = yield NodeGit.Diff.indexToWorkdir(repo, null, diffOpts);
    }
    return diff;
});

exports.printDiff = co.wrap(function *(repo, subRepo, opts) {
    assert.instanceOf(repo, NodeGit.Repository);
    assert.instanceOf(subRepo, NodeGit.Repository);
    const execStr = yield subDiffCmdBuilder(repo, subRepo, opts);
    console.log("qqqq execStr = '" + execStr + "'");
    yield spawn(execStr, {
        shell: true,
        stdio: 'inherit'
    });
});
