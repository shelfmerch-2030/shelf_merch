# Production quality control

Ops admins, production managers and super admins record inspections in Production → Manage. Auditors can review inspection history without changing it. Order details link directly to the associated production task.

The admin order page shows five fulfillment steps: Review, Production, QC & packing, Dispatch and Delivery. After order approval, Start production can create a task directly, including for orders already awaiting mockup review. Order mockup upload and approval are optional and remain available under More actions. Optional vendor assignment saves with Start production. Notes, inspection history, replacements and manual status changes are expandable. Dispatch is offered once QC and packing are complete and an AWB is attached.

1. Review the approved mockup, artwork specifications, product variants, personalization and quantities in the order.
2. Finish production and move the task to `qc_pending`.
3. Inspect the physical products. Confirm product details, artwork, workmanship, quantities and kit contents (confirm not applicable where appropriate).
4. Enter inspected and failed unit counts. Upload at least one photo; uploads save immediately. Choose Pass or Fail explicitly. A pass requires all checks, every ordered unit inspected and zero failed units. A failure requires a reason and at least one failed unit.
5. Record QC. Failure returns the task to `in_production`; the order remains pending QC. Rework and return to `qc_pending` for a new inspection. Every attempt retains its inspector, time, checks, quantities, notes and evidence.
6. Passing moves the task to `packing`; the order remains `qc_pending`. Finish packing, choose `ready_to_ship`, and click Complete packing. This marks the order `packed`.
7. Request shipment once packing is complete. Complete the task after a shipment has been created.

Orders and Production have QC status filters. Status controls cannot substitute for recording an inspection. Manual shipment creation, bulk AWBs, Delhivery requests, dispatch events and order status APIs enforce the same QC and packing requirements.

Existing packed orders with a passed QC task still in `packing` must complete packing in Production. Orders lacking any passed QC task require operational reconciliation before dispatch; their old order status does not grant a QC exemption. Deploy the API and web changes together: QC submission now requires checks, quantities and task-attached photo URLs.

QC photos use the configured storage driver under the tenant's `qc` directory, with a 5 MB image upload limit. Existing storage access rules continue to apply.
