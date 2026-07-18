# NCES IPEDS institution directory

`ipeds-hd2024.json` is generated from the National Center for Education Statistics Integrated Postsecondary Education Data System (IPEDS), 2024 Institutional Characteristics directory file (`HD2024.csv`).

- Official data page: <https://nces.ed.gov/ipeds/datacenter/DataFiles.aspx?rtid=1>
- Download used: <https://nces.ed.gov/ipeds/datacenter/data/HD2024.zip>
- Downloaded: 2026-07-17
- ZIP SHA-256: `d98425c123d7c0e872aec6e83960dfb501884818bf17385c340790f3d1f28345`
- CSV SHA-256: `d7b20e136fd971d7dce8ad6ec9b7002f0f281f133959f2c3a6c089a5a4610fe5`
- Imported rows: 6,072

The artifact retains every HD2024 row, including current, inactive, closed, and merged records. `UNITID` is the stable source identifier. IPEDS confirms institution identity and lifecycle; it is not evidence that any email domain belongs to students at that institution.

Regenerate only from an explicitly reviewed NCES file:

```powershell
Expand-Archive HD2024.zip -DestinationPath .tmp-ipeds
node scripts/import-ipeds-directory.mjs .tmp-ipeds/HD2024.csv
```

The importer refuses a file whose CSV hash or row count differs from the reviewed release. A later IPEDS year requires deliberate importer updates and a new forward migration; do not overwrite deployed migration history. Website fields preserve the original IPEDS value as `sourceWebsite` while the database receives one whitespace-free primary URL suitable for a constrained field.
