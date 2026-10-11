-- Initial conservative seed for TORQWISE first-party fitment catalog.
-- Status is cross_reference, not verified, because publicly available catalogs disagree on some later-year/trim coverage.
insert into public.fitment_applications
(part_number, brand, part_name, vehicle_year_start, vehicle_year_end, make, model, axle_position, market, status, evidence, fitment_notes, source_checked_at)
values
('WB510089','WJB','Front wheel bearing',2006,2016,'Honda','Civic','Front','North America','cross_reference',
 '[{"title":"WJB Automotive Buyer''s Guide (2022 Q2)","url":"https://wjbautomotiveshop.com/wp-content/uploads/2022/06/WJB-Automotive_Buyers-Guide_2022Q2.pdf","source_type":"manufacturer_catalog","claim":"Lists WB510089 as a wheel bearing for Honda Civic 2006–2016."},{"title":"CARiD WJB WB510089 fitment listing","url":"https://www.carid.com/wjb/product-mpn-wb510089.html","source_type":"parts_catalog","claim":"Lists front driver/passenger side bearing for Honda Civic 2006–2016 and 2008 Civic Si."},{"title":"QJZ Bearings 510089 fitment listing","url":"https://qjz-bearings.com/products/510089","source_type":"parts_catalog","claim":"Lists front bearing cross-reference WB510089 for Civic applications with specific year/engine/trim restrictions."}]'::jsonb,
 'Cross-reference only. Catalogs disagree on later-year and trim/engine coverage. Do not present as a guaranteed fit for a specific vehicle without resolving the exact application and variant restrictions.',
 now()),
('WB510089','WJB','Front wheel bearing',2013,2014,'Acura','ILX','Front','North America','cross_reference',
 '[{"title":"The Wrench Monkey Mevotech H510089 catalog","url":"https://www.thewrenchmonkey.ca/brands/mevotech/h510089","source_type":"parts_catalog","claim":"Lists WJB WB510089 as an interchange for Mevotech H510089 and lists Acura ILX 2013–2014."},{"title":"FinditParts Mevotech H510089 cross-reference","url":"https://www.finditparts.com/products/9287936/mevotech-h510089","source_type":"parts_catalog","claim":"Cross-reference listing includes WJB WB510089 and Acura ILX 2013–2014."}]'::jsonb,
 'Cross-reference only; the cited WJB manufacturer guide confirms Civic coverage but this seed does not include an OEM-confirmed Acura ILX application. Treat as high-confidence cross-reference, not a guaranteed fit.',
 now())
on conflict do nothing;
