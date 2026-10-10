# Phase 2 test expectations

`mercurypay.analysis.json` is generated from a genuinely executed local analysis
of the committed synthetic contracts, mapping and unchanged adapter. It is a
reviewed regression expectation, not independent runtime verification. It contains
no timestamps, personal paths, model responses, replay results or repair claims.

The golden test recomputes from source bytes on Windows and Ubuntu. Any change
requires reviewing semantic findings, exact spans, evidence bindings and fixture
identities; tests never update this file or the seven immutable fixture artifacts.

`directionality.json` contains controlled request/response enum and minimum cases plus
an opaque email-format unknown. Compatibility expectations were declared first; the
full expected delta objects were captured from actual comparator runs and reviewed
against those directional expectations. They are regression expectations only.
