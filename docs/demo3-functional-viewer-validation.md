# Demo 3 Functional Viewer Validation

The development preview loaded the read-only `demo3_functional_downsampled` sidecar from project storage. Its first frame showed Anubis, tick 1, ten player records, ten available approximate player records, nineteen capsules per record, and `functional_only=true`.

The viewer presents `generic_fallback`, `approximate`, and `evidence_allowed=false` in the functional panel. The separate LOS panel reported zero visible pairs for that first sampled frame. No `SpatialShotEvidence` section was present in the sidecar payload.

With the Functional control enabled, the map showed the separate approximate layer and legend. Selecting one real player reduced the functional panel to one player record with nineteen capsules and updated the read-only tick inspector. It did not change the LOS counter or expose any evidence action.
