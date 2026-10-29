#!/bin/bash
# Assert.IQ Audit Verdict Script
# Given a verdict_id, produce full audit record for reproducibility
# 
# Usage:
#   ./audit-verdict.sh <verdict_id>
#
# Example:
#   ./audit-verdict.sh v-pr-gh-12345-20260811T145920Z

set -e

VERDICT_ID="${1}"
VERDICTS_DIR="${VERDICTS_DIR:-.assert-iq/verdicts}"

if [ -z "$VERDICT_ID" ]; then
    echo "Usage: $0 <verdict_id>"
    echo ""
    echo "Example: $0 v-pr-gh-12345-20260811T145920Z"
    exit 1
fi

# Find verdict in archive
VERDICT_FILE=$(find "$VERDICTS_DIR/archive" -name "verdicts-*.jsonl" -type f | xargs grep -l "\"verdict_id\":\"$VERDICT_ID\"" 2>/dev/null | head -1)

if [ -z "$VERDICT_FILE" ]; then
    echo "❌ Verdict not found: $VERDICT_ID"
    exit 1
fi

# Extract verdict from JSONL
VERDICT=$(grep "\"verdict_id\":\"$VERDICT_ID\"" "$VERDICT_FILE" | head -1)

if [ -z "$VERDICT" ]; then
    echo "❌ Verdict record malformed"
    exit 1
fi

# Parse verdict fields using jq (if available)
if command -v jq &> /dev/null; then
    VERDICT_ID=$(echo "$VERDICT" | jq -r '.verdict_id')
    VERDICT_TYPE=$(echo "$VERDICT" | jq -r '.verdict_type')
    VERDICT_BAND=$(echo "$VERDICT" | jq -r '.verdict_band')
    VERDICT_SCORE=$(echo "$VERDICT" | jq -r '.verdict_score')
    ISSUED_AT=$(echo "$VERDICT" | jq -r '.issued_at')
    ISSUED_BY=$(echo "$VERDICT" | jq -r '.issued_by')
    PR_ID=$(echo "$VERDICT" | jq -r '.pr_id // "N/A"')
    RELEASE_ID=$(echo "$VERDICT" | jq -r '.release_id // "N/A"')
    MEMORY_VERSION=$(echo "$VERDICT" | jq -r '.memory_version // "N/A"')
    
    # Generate audit report
    cat << REPORT
================================================================================
ASSERT.IQ VERDICT AUDIT RECORD
================================================================================

Verdict ID:     $VERDICT_ID
Type:           $VERDICT_TYPE
Decision:       $VERDICT_BAND (score: $VERDICT_SCORE)
Issued:         $ISSUED_AT
Issued By:      $ISSUED_BY

PR/Release:     PR=$PR_ID | Release=$RELEASE_ID

Memory State:
  Version:      $MEMORY_VERSION
  Snapshot:     .snapshots/mem-${MEMORY_VERSION%%:*}.tar.gz

Layer Scores:
$(echo "$VERDICT" | jq '.layer_scores | to_entries[] | "  \(.key): \(.value.state) (score: \(.value.score))"')

Assumptions:
$(echo "$VERDICT" | jq '.assumptions[]?' | sed 's/^/  - /')

Full Verdict Record:
$VERDICT

================================================================================
Reproducibility Instructions:

1. Restore memory snapshot:
   tar xzf .snapshots/mem-${MEMORY_VERSION%%:*}.tar.gz -C .assert-iq

2. Re-run the assessment:
   /risk-assess-pr --pr-id=$PR_ID --memory-version=$MEMORY_VERSION

3. Expected result: Same verdict (band=$VERDICT_BAND, score=$VERDICT_SCORE)

================================================================================
REPORT
else
    # Fallback without jq
    echo "Verdict record:"
    echo "$VERDICT"
    echo ""
    echo "Note: Install 'jq' for formatted audit report"
fi
