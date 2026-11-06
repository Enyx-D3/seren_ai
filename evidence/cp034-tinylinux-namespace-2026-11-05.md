# CP034 — Optional namespaced Linux fixed-task lane

**Overall native TinyLinux / full MRS gate: PARTIAL, not accepted.**
**Narrow local process-isolation experiment: PASS_SCOPED.**

## Source, environment, and exact scope

- Starting repository: `Enyx-D3/seren_ai` commit `ac763ad` (CP033); changes are uncommitted and were not pushed or deployed.
- Source `tools/b2_cp034_tinylinux_namespace.mjs`, SHA-256 `62dc583cbe7354c023955c756ea9c55df6e41e77a3e9493ba0a9241197afcc53`.
- Selftest `tools/b2_cp034_tinylinux_namespace_selftest.mjs`, SHA-256 `9289f833847881240b0c827ac3af64dc1284bdc5221ed35349403c550564734b`.
- Host: Linux x86_64, Node v24.22.1, `unshare`, bubblewrap 0.12.0, `prlimit`, Python 3.13; no `/dev/kvm` or QEMU system binary.
- Execution: `prlimit` caps virtual address space at 256 MiB, CPU time at 3 seconds, file descriptors 64, processes 32; `unshare -Urn` creates user and isolated network namespaces; `bwrap` creates PID/IPC/UTS namespaces, readonly system libraries and a private tmpfs. Parent creates a fresh process group and issues actual group `SIGKILL` on timeout or abort. `--die-with-parent` protects nested work.
- Interface accepts **only fixed, locally authored Python kernel tasks** `sum_squares(n <= 100000)` and `environment_probe`. Its `kill_probe` is an explicitly enabled developer-only stress fixture. It never runs user/model-generated source code or shell commands.
- This is **not** a virtual machine/TinyLinux guest, not integrated into the browser app, not a general compiler sandbox, and not a proof of resource caps or isolation on macOS. No additional model, remote inference, or daemon.

## Reproduction and measured results

Run from the repository root:

```bash
node tools/b2_cp034_tinylinux_namespace_selftest.mjs
```

Result: `PASS_SCOPED_LINUX_NAMESPACE_FIXED_TASK_LANE`; **18 checks**. Six independent sum-of-squares values matched Node BigInt closed-form verification (`n=0,1,3,7,97,10000`). Observed per-process end-to-end elapsed: **25.337–142.047 ms** on this host. These times include namespace/container startup; no comparative speedup was demonstrated.

Host filesystem isolation probe: `/workspace` and `/home/agent` were invisible; the network namespace differed from the parent and its route table had zero routes. An earlier probe falsely returned routeCount=-1 because the isolated `/proc/net/route` lacked even a header; this was corrected by bounding the count at zero. The final test then passed.

Security/permission checks: eight invalid/malformed/over-budget/no-approval inputs all failed **before spawning**. A separate pre-aborted request also made no process. A deliberately endless fixed test exceeded the 125 ms wall deadline and the wrapper process was terminated by **SIGKILL**. A second endless fixed test received a real AbortSignal after 250 ms and was also terminated by **SIGKILL**. No unsafe fallback to an unnamespaced process is implemented.

The direct `bwrap --unshare-net` route failed `NETLINK_ROUTE socket: Operation not permitted` in this container. The tested `unshare -Urn` then `bwrap` route succeeded; that workaround is environment-specific and requires fresh local validation on another machine.

## Remaining proof / next integration

1. Recover and authenticate the historical TinyLinux implementation and its fixed algorithms; this Node helper is not a substitute for that source.
2. Add explicit owner-approved native-tool architecture and a permission/capability gateway. Keep the current browser-only V1 independent of native tools.
3. Prove hostile-input isolation beyond a trusted fixed kernel (filesystem, network, symlink and process ancestry, actual memory/RSS, CPU/thermal, data lifetime, nested subprocesses).
4. Demonstrate safe, cancellable integration on target hardware; compare exact task throughput/cost against browser Worker, and audit tool effects independently.

Rollback: remove this `tools/b2_cp034_tinylinux_namespace.mjs` prototype, its selftest and this evidence file. No active runtime or V1 route was changed.
