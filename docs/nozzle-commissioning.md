# Nozzle Commissioning & Totalizer Precedence Architecture

## 1. Overview & Purpose

In a retail fuel forecourt, an outlet's initial opening balance batch (`OpeningBalanceBatch`) is captured and confirmed once during outlet onboarding. Once confirmed, this batch becomes strictly locked and immutable.

When additional nozzles or dispensers are installed after the initial opening balance has already been confirmed, those newly created nozzles lack starting totalizers. Without an authoritative starting meter reading:
- Outlet operational readiness fails (`nozzle_starting_reading_missing`).
- Shift opening wizards cannot derive an authoritative opening reading.

The **Commission New Nozzle** workflow provides a controlled, audit-tracked, and immutable mechanism to establish the authoritative starting totalizer for any nozzle created post-onboarding, without unlocking, modifying, or compromising the confirmed initial opening-balance batch or generating spurious stock/accounting entries.

---

## 2. Authoritative Reading Source Precedence

When preparing a shift or opening an operational shift, the starting totalizer for each nozzle is derived in strict hierarchical order:

```text
┌─────────────────────────────────────────────────────────────┐
│ 1. Previous Closed Shift's Final Reading                    │
│    (Latest eligible closed shift prior to effective time)   │
└──────────────────────────────┬──────────────────────────────┘
                               │ (if none exists)
                               ▼
┌─────────────────────────────────────────────────────────────┐
│ 2. Valid Nozzle Commissioning Record                        │
│    (Authoritative initial totalizer for post-setup nozzles) │
└──────────────────────────────┬──────────────────────────────┘
                               │ (if none exists)
                               ▼
┌─────────────────────────────────────────────────────────────┐
│ 3. Confirmed Initial Opening-Balance Batch Reading          │
│    (Established during initial outlet onboarding)           │
└──────────────────────────────┬──────────────────────────────┘
                               │ (if none exists)
                               ▼
┌─────────────────────────────────────────────────────────────┐
│ 4. Fallback: Manual Exception Required / Block Shift        │
│    (Requires supervisor intervention with logged reason)     │
└─────────────────────────────────────────────────────────────┘
```

### Precedence Rules
1. **Subsequent Shift Continuity**: Once a nozzle is operated in a shift and that shift is closed, subsequent shifts derive their opening reading from that closed shift's closing meter reading (`SOURCE_PREVIOUS_SHIFT`), superseding both commissioning and initial opening balance.
2. **Discarded Shift Safety**: If an open shift is discarded without closing, its uncommitted meter readings are disregarded, and the nozzle safely falls back to its commissioning or opening-balance baseline.
3. **Mid-Shift Integrity**: Standalone commissioning does not silently inject a nozzle into a currently open shift. Bringing a newly commissioned nozzle into an active shift requires the supervisor `activate_nozzle_midshift` workflow.

---

## 3. Data Model & Immutability Guarantees

### Models
- **`NozzleCommissioning`** (`apps/operations/models.py`):
  - `organisation`: Foreign key to the tenant organisation.
  - `outlet`: Foreign key to the specific outlet.
  - `nozzle`: Unique one-to-one link to the nozzle.
  - `initial_totalizer`: Authoritative non-negative decimal reading (3 decimal precision).
  - `effective_at`: Timestamp when the reading becomes valid.
  - `reason`: Mandatory operational justification.
  - `notes`: Optional remarks.
  - **Snapshots**: Point-in-time snapshots of dispenser code, nozzle code, and fuel product (id, code, name) preserving auditability even if master records change later.
  - **Immutability**: `save()` and `delete()` methods raise `ValidationError` on modifications.

- **`NozzleCommissioningAuditLog`** (`apps/operations/models.py`):
  - Append-only audit record created atomically with commissioning.
  - Captures actor, action timestamp, reason, notes, and full metadata payload.
  - Protected against updates and deletions.

### Scope & Constraints
- **Meter Continuity Only**: Nozzle commissioning establishes meter baselines only. It produces **no** stock ledger movements and **no** financial accounting journal entries.
- **Single Master Baseline**: A nozzle can have at most one commissioning record. If historical closed shifts already exist for a nozzle, ordinary commissioning is rejected.
- **Zero Impact on Confirmed Batches**: The confirmed `OpeningBalanceBatch` remains 100% untouched.

---

## 4. API Endpoints

All endpoints are scoped by organisation and outlet and enforce tenant boundaries:

| Method | Endpoint | Description | Permission Required |
|---|---|---|---|
| `GET` | `/api/v1/organisations/<org_id>/outlets/<outlet_id>/nozzles/commissioning-status/` | Returns commissioning and reading source status for all active nozzles | `nozzle.view` |
| `POST` | `/api/v1/organisations/<org_id>/outlets/<outlet_id>/nozzles/<nozzle_id>/commission/` | Establishes starting totalizer for a single nozzle | `nozzle.commission` |
| `POST` | `/api/v1/organisations/<org_id>/outlets/<outlet_id>/nozzles/bulk-commission/` | Atomically commissions multiple missing nozzles in a single batch | `nozzle.commission` |

### Request Payload Example (Single)
```json
{
  "initial_totalizer": "12450.500",
  "effective_at": "2026-09-04T10:00:00Z",
  "reason": "Replacement pump DU-02 installation",
  "notes": "Factory calibrated reading",
  "activate": true
}
```

---

## 5. User Interface Workflows

### Master Data (`/app/settings/dispensers-nozzles`)
1. **Starting Reading / Commissioning Status Badges**:
   - `Opening Balance`: Displayed for nozzles seeded during outlet opening balance batch.
   - `Commissioned`: Displayed with a teal badge, showing the authoritative initial reading, commissioner, and date.
   - `Previous Shift`: Displayed for nozzles that have active operational history.
   - `Commissioning Required`: Amber warning badge indicating the nozzle is active but has no starting totalizer.
2. **Single Commissioning Drawer**:
   - Contextual drawer displaying read-only outlet, dispenser, nozzle, and fuel details.
   - Mandatory totalizer input, effective date-time, and mandatory operational reason.
   - Warning banner emphasizing record immutability.
3. **Bulk Commissioning Drawer**:
   - Table of all uncommissioned nozzles with row-level totalizer and notes inputs.
   - Common effective timestamp and operational reason.
   - Atomic submission ensuring all-or-nothing validation.

### Shift Management (`/app/operations/shifts/open`)
- The shift preparation preview checks all active nozzles.
- If a nozzle was commissioned, its opening source displays as `"Opening source: Nozzle commissioning"` with reference to the commissioning record.
- The shift opens seamlessly without triggering `nozzle_starting_reading_missing` blockers.

---

## 6. Future Scenarios: Meter Replacement & Resets

For mid-lifecycle meter changes (e.g. meter replacement, electronic head swap, totalizer rollover, or recalibration):
1. **Mid-Shift Reset / Handover**: Can be handled through supervisory meter adjustments or mid-shift replacement events.
2. **Post-Closure Replacement**: An event-based meter reset audit table can be recorded between shifts, providing an explicit jump bridge from the last closed shift reading to the new replacement meter starting reading.
