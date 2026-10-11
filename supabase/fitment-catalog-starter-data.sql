-- TORQWISE reviewed starter fitment records.
-- These are conservative aftermarket cross-references, not OEM-certified guarantees.
-- Safe to re-run: each row is inserted only when its part/application combination is absent.
insert into public.fitment_applications
(part_number,brand,part_name,vehicle_year_start,vehicle_year_end,make,model,axle_position,market,status,evidence,fitment_notes,reviewer,reviewed_at,source_checked_at)
select v.part_number,v.brand,v.part_name,v.year_start,v.year_end,v.make,v.model,v.axle,v.market,'cross_reference',v.evidence::jsonb,v.notes,'TORQWISE initial catalog review',now(),now()
from (values
('WB510089','WJB','Front wheel bearing',2006,2016,'Honda','Civic','Front','North America',
 '[{"title":"WJB Automotive Buyer Guide 2022 Q2","url":"https://wjbautomotiveshop.com/wp-content/uploads/2022/06/WJB-Automotive_Buyers-Guide_2022Q2.pdf"},{"title":"CARiD WJB WB510089 product page","url":"https://www.carid.com/wjb/product-mpn-wb510089.html"},{"title":"The Wrench Monkey Mevotech H510089 cross-reference","url":"https://www.thewrenchmonkey.ca/brands/mevotech/h510089"}]',
 'Conservative catalog cross-reference. Other listings extend Civic coverage through 2018, but years/engine variants differ by source. Verify exact year/trim/engine and ABS configuration.'),
('WB510089','WJB','Front wheel bearing',2013,2014,'Acura','ILX','Front','North America',
 '[{"title":"The Wrench Monkey Mevotech H510089 cross-reference","url":"https://www.thewrenchmonkey.ca/brands/mevotech/h510089"},{"title":"FinditParts Mevotech H510089 cross-reference","url":"https://www.finditparts.com/products/9287936/mevotech-h510089"}]',
 'Cross-reference only; the available evidence links WJB WB510089 through Mevotech H510089. Confirm exact engine/trim and ABS configuration before calling it a match.')
) as v(part_number,brand,part_name,year_start,year_end,make,model,axle,market,evidence,notes)
where not exists (
 select 1 from public.fitment_applications f
 where lower(f.part_number)=lower(v.part_number)
 and lower(coalesce(f.make,''))=lower(v.make)
 and lower(coalesce(f.model,''))=lower(v.model)
 and f.vehicle_year_start is not distinct from v.year_start
 and f.vehicle_year_end is not distinct from v.year_end
);