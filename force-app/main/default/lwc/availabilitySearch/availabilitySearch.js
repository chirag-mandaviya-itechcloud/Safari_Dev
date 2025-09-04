import { LightningElement, track, api } from 'lwc';
import getSupplier from '@salesforce/apex/AvailabilitySearchController.getSupplier';
import getOptions from '@salesforce/apex/AvailabilitySearchController.getOptions';
import { ShowToastEvent } from 'lightning/platformShowToastEvent';
import getOpts from '@salesforce/apex/AvailabilitySearchController.getOpts';
import getOptByOptCode from '@salesforce/apex/HotelController.getOptByOptCode';
import getLocationOptions from '@salesforce/apex/AvailabilitySearchController.getLocationOptions';
import SaveQuoteLineItem from '@salesforce/apex/QuoteLineItemController.saveQuoteLineItem';

const CURRENCY = 'ZAR'; // API returns ZAR in your sample

export default class AvailabilitySearch extends LightningElement {
    @track filters = {
        serviceType: 'AC',
        startDate: '',
        durationNights: '1',
        endDate: '',
        quantityRooms: '1',
        location: '',
        starRating: '',
        supplierStatus: '',
        attractions: '',
        liveAvailability: '',
        supplierName: ''
    };

    @api recordId;

    // flat rows (if you still need them) and grouped view used by UI
    @track rows = [];
    @track groups = []; // [{ crmCode, supplier, items: [...] }]
    @track locationOptions = [];
    hasSearched = true;

    loading = false;
    error;
    adults = 2;
    children = 0;

    connectedCallback() {
        this.loadLocationOptions();
    }

    async loadLocationOptions() {
        try {
            const options = await getLocationOptions();
            this.locationOptions = (options || [])
                .map(o => ({ label: o.label, value: o.value }))
                .sort((a, b) => a.label.localeCompare(b.label)); // 👈 sort by label
        } catch (e) {
            console.error(`${e}`);
        }
    }

    // ----- Combobox options (match the screenshot) -----
    get serviceTypeOptions() {
        return [
            { label: 'Accommodation', value: 'AC' },
            { label: 'Transfer', value: 'TF' },
            { label: 'Day Tours', value: 'DT' },
            { label: 'Overland Tours', value: 'OV' },
            { label: 'Short-break Packages', value: 'PK' },
        ];
    }
    get durationOptions() {
        return Array.from({ length: 30 }, (_, i) => ({ label: String(i + 1), value: String(i + 1) }));
    }
    get roomQtyOptions() {
        return Array.from({ length: 9 }, (_, i) => ({ label: String(i + 1), value: String(i + 1) }));
    }
    get starOptions() {
        return [
            { label: 'Any', value: '' },
            { label: '5 Star', value: '5 Star' },
            { label: '4 Star', value: '4 Star' },
            { label: '3 Star', value: '3 Star' }
        ];
    }
    get anyOptions() {
        return [
            { label: 'Any', value: '' },
            { label: 'Preferred', value: 'PF' },
            { label: 'Pre-paid / Voucher', value: 'PP' }
        ];
    }
    get liveAvailOptions() {
        return [
            { label: 'Any', value: '' },
            { label: 'Available', value: 'OK' },
            { label: 'On Request', value: 'RQ' },
            { label: 'Unavailable', value: 'NA' }
        ];
    }

    handleInput = (e) => {
        const { name, value } = e.target;
        console.log(`Changed ${name} : ${value}`);
        if (name === 'locationCode') {
            const picked = this.locationOptions.find(o => o.value === value);
            this.filters = { ...this.filters, locationCode: value, location: picked?.label || '' };
        } else {
            this.filters = { ...this.filters, [name]: value };
        }

        this.filters = { ...this.filters, [name]: value };
    };

    async handleSearch() {
        this.loading = true;
        this.error = undefined;
        this.rows = [];
        this.groups = [];

        // ---- Required field validation ----
        const requiredFields = [
            { key: 'serviceType', label: 'Service Type' },
            { key: 'startDate', label: 'Start Date' },
            { key: 'durationNights', label: 'Duration (Nights)' },
            { key: 'quantityRooms', label: 'Quantity (Rooms)' },
            { key: 'locationCode', label: 'Location' }
        ];
        const missing = requiredFields.filter(f => !this.filters[f.key]);
        if (missing.length) {
            const fieldNames = missing.map(f => f.label).join(', ');
            this.showToast('Missing Required Fields', `Please fill in: ${fieldNames}`, 'error');
            this.loading = false;
            return;
        }

        try {
            let locationCode = this.filters.locationCode || '';
            let crmCode = '';
            const locationName = this.filters.location;
            let opt = '';

            // const result = await getOpts({ locationName });
            // if (result?.length > 0) {
            //     locationCode = result[0].Location__c;
            // }

            if (this.filters.supplierName) {
                const supplierDetails = await getSupplier({ supplierName: this.filters.supplierName });
                if (supplierDetails?.length > 0) {
                    crmCode = supplierDetails[0].CRM_Code__c;
                }
                opt = `${locationCode}${this.filters.serviceType}${crmCode}??????`;
            } else {
                opt = `${locationCode}${this.filters.serviceType}????????????`
            }

            // build RoomConfigs array based on quantityRooms
            const roomQty = parseInt(this.filters.quantityRooms, 10) || 1;
            const roomConfigs = Array.from({ length: roomQty }, () => ({
                RoomConfig: { Children: this.children, Adults: this.adults }
            }));

            const payload = {
                records: [{
                    Opt: opt,
                    Info: 'GSI',
                    DateFrom: this.filters.startDate,
                    SCUqty: this.filters.durationNights,
                    ButtonName: 'Accommodation',
                    RoomConfigs: roomConfigs,
                    MaximumOptions: 30,
                    ...(this.filters.starRating ? { ClassDescription: this.filters.starRating } : {})
                }]
            };

            console.log('Payload : ', payload);

            const body = await getOptions({ reqPayload: JSON.stringify(payload) });
            const raw = (typeof body === 'string') ? JSON.parse(body) : body;

            console.log("Response Body: ", raw);

            // build flat rows and grouped view
            this.rows = this.transformApiData(raw);
            this.groups = this.groupBySupplier(this.rows);
        } catch (err) {
            this.error = (err && err.body && err.body.message) ? err.body.message : (err?.message || 'Unexpected error');
            this.rows = [];
            this.groups = [];
        } finally {
            this.loading = false;
            this.hasSearched = true;
        }
    }

    transformApiData(apiPayload) {
        const payload = (typeof apiPayload === 'string') ? JSON.parse(apiPayload) : apiPayload;

        // Extract the array of option objects regardless of nesting style
        let options = [];
        if (Array.isArray(payload?.result)) {
            options = payload.result.flatMap(x => Array.isArray(x) ? x : [x]);
        } else if (Array.isArray(payload) && payload[0]?.result) {
            const r = payload[0].result;
            options = Array.isArray(r) ? r.flatMap(x => Array.isArray(x) ? x : [x]) : [];
        }

        const out = [];
        options.forEach((opt) => {
            const gen = opt?.OptGeneral || {};
            const supplier = gen?.SupplierName || '';
            const desc = gen?.Description || '';
            const locality = gen?.LocalityDescription || gen?.Locality || '';
            const childPolicy = this.composeChildPolicy(gen);

            const optMeta = {
                optId: opt?.Opt || '',
                optionNumber: opt?.OptionNumber || ''
            };

            const rawStay = opt?.OptStayResults;
            const stays = Array.isArray(rawStay) ? rawStay : (rawStay ? [rawStay] : []);

            stays.forEach((stay, idx) => {
                const row = this.mapStayToRow(stay, supplier, desc, locality, childPolicy, optMeta);
                out.push({ ...row, id: `${optMeta.optionNumber || optMeta.optId}-${idx}` });
            });
        });

        // stable numeric ids if you prefer
        return out.map((r, i) => ({ ...r, id: String(i) }));
    }

    mapStayToRow(stay, supplier, desc, locality, childPolicy, optMeta = { optId: '', optionNumber: '' }) {
        const availabilityCode = (stay?.Availability || '').toUpperCase();
        const statusMap = { OK: 'Available', RQ: 'On Request', NO: 'Unavailable', NA: 'Unavailable' };
        const status = statusMap[availabilityCode] || (availabilityCode || '—');

        const nett = this.formatMoney(stay?.AgentPrice ?? stay?.TotalPrice);
        const sell = this.formatMoney(stay?.TotalPrice ?? stay?.AgentPrice);

        const rateText =
            (typeof stay?.RateText === 'string' && stay.RateText) ||
            (stay?.ExternalRateDetails?.ExtRatePlanDescr) ||
            '';

        const externalDescr = stay?.ExternalRateDetails?.ExtOptionDescr || '';

        const roomType = stay?.RoomList?.RoomType || 'TWIN AVAIL';
        const crmCode = this.extractCrm(optMeta.optId); // 6–11 chars inclusive

        return {
            service: `${desc} - ${supplier}${locality ? ` (${locality})` : ''}`,
            rateCategory: externalDescr
                ? (typeof stay?.RateName === 'string' && stay.RateName ? stay.RateName : 'Wholesale')
                : 'Contract net rate with breakfast',
            rateDescription: rateText || '—',
            childPolicy,
            supplier,
            inCancellation: this.cancelWindow(stay?.CancelHours),
            nett,
            sell,
            status,
            roomType,
            statusClass: `slds-truncate ${status === 'Available' ? 'slds-text-color_success'
                : status === 'On Request' ? 'slds-text-color_warning'
                    : 'slds-text-color_error'
                }`,
            addDisabled: (status === 'Unavailable'), // disable ONLY when unavailable
            optId: optMeta.optId,
            optionNumber: optMeta.optionNumber,
            rateId: stay?.RateId || '',
            crmCode
        };
    }

    extractCrm(optId) {
        // example: NTYACCAB001SSTAFB -> CAB001 from positions 6..11 (0-based 5..10)
        if (!optId || optId.length < 11) return '';
        return optId.substring(5, 11);
    }

    groupBySupplier(rows) {
        // Group on CRM code; carry first supplier name seen
        const map = new Map();
        rows.forEach(r => {
            const key = r.crmCode || '—';
            if (!map.has(key)) {
                map.set(key, { crmCode: key, supplier: r.supplier || '—', items: [] });
            }
            map.get(key).items.push(r);
        });

        // sort suppliers alphabetically; inside, sort by status then nett ascending
        const groups = Array.from(map.values())
            .sort((a, b) => a.supplier.localeCompare(b.supplier))
            .map(g => ({
                ...g,
                items: g.items.slice().sort((x, y) => {
                    const s = (x.status || '').localeCompare(y.status || '');
                    if (s !== 0) return s;
                    const nx = Number((x.nett || '').replace(/[^\d]/g, '')) || 0;
                    const ny = Number((y.nett || '').replace(/[^\d]/g, '')) || 0;
                    return nx - ny;
                })
            }));

        return groups;
    }

    composeChildPolicy(gen) {
        const aFrom = gen?.Adult_From, aTo = gen?.Adult_To;
        const cFrom = gen?.Child_From, cTo = gen?.Child_To;
        const iFrom = gen?.Infant_From, iTo = gen?.Infant_To;
        const parts = [];
        if (aFrom || aTo) parts.push(`Adults: ${aFrom || '—'}-${aTo || '—'}`);
        if (cFrom || cTo) parts.push(`Child: ${cFrom || '—'}-${cTo || '—'}`);
        if (iFrom || iTo) parts.push(`Infant: ${iFrom || '—'}-${iTo || '—'}`);
        return parts.join(', ') || '—';
    }

    cancelWindow(hours) {
        if (!hours) return 'No';
        const h = Number(hours);
        if (Number.isFinite(h) && h > 0) return 'Yes';
        return 'No';
    }

    formatMoney(amount) {
        if (amount == null || amount === '') return '';
        const n = Number(amount);
        if (!Number.isFinite(n)) return '';
        const val = n / 100; // sample shows cents
        return `${CURRENCY}${val.toLocaleString()}`;
    }

    get showNoHotels() {
        return this.hasSearched && !this.loading && !this.error && (!this.groups || this.groups.length === 0);
    }

    async handleAdd(event) {

        const rowId = event.currentTarget.dataset.rowId;

        // find selected row from flattened rows
        const row = this.rows.find(r => r.id === rowId);
        if (!row) return;

        this.loading = true;
        // pull OPT record for create QuoteLineItem
        const selectedOPT = await getOptByOptCode({ optCode: row.optId });

        // build RoomConfigs array based on quantityRooms
        const roomQty = parseInt(this.filters.quantityRooms, 10) || 1;
        const roomConfigs = Array.from({ length: roomQty }, () => ({
            children: 0,
            adults: 2
        }));

        const roomConfigurations = roomConfigs.map((room, i) => ({
            id: i + 1,
            serviceType: 'Accommodation',
            serviceSubtype: row.roomType,
            adults: room.adults,
            children: room.children,
            infants: 0,
            passengers: room.adults + room.children + 0,
            quoteLineItemId: null,
            order: i + 1
        }));

        const params = {
            serviceLineItemName: row.supplier,
            selectedServiceType: selectedOPT[0].SRV_Name__c,
            selectedLocation: selectedOPT[0].LOC_Name__c,
            selectedSupplierName: row.supplier,
            selectedSupplierId: selectedOPT[0].CRM_Lookup__c,
            selectedServiceDetail: `${selectedOPT[0].Description__c} || ${selectedOPT[0].Comment__c}`,
            selectedServiceDetailDisplayName: `${selectedOPT[0].Description__c} || ${selectedOPT[0].Comment__c}`,
            quoteLineItemId: 'newitem',
            serviceClientNotes: '',
            serviceReservationNumber: '',
            serviceSelectServiceStatus: 'Not Booked',
            serviceExpiryDate: '',
            overrideDetails: false,
            overridenSupplierPolicy: true,
            selectedPassengers: [],
            serviceDate: this.filters.startDate,
            numberOfDays: this.filters.durationNights.toString(),
            displayDuration: this.filters.durationNights.toString(),
            quoteId: this.recordId,
            roomConfigurations: roomConfigurations,
            logistics: {},
            flightDetail: {},
            oldChargeTypes: [],
            keepRatesOnDateChange: true,
            selectedOPT: selectedOPT[0].ExternalId__c,
            addOns: [],
            serviceInclusionNote: '',
            serviceExclusionNote: '',
            supplierDescription: '',
            serviceDescription: ''
        };

        console.log("Final Params : ", params);

        try {
            const result = await SaveQuoteLineItem(params);
            console.log("Result: ", result);
            if (result.length === 0) {
                this.showToast('Success', 'QuoteLineItem Added Successfully.', 'success');
            } else {
                this.showToast('Error', 'Error occured while adding QuoteLineItem.', 'error');
            }
        } catch (error) {
            // eslint-disable-next-line no-console
            console.error(`Error saving for "${row.supplier}": `, error);
            this.showToast('Error', `Error occured while adding QuoteLineItem - ${error}`, 'error');
        } finally {
            this.loading = false;
        }
    }

    // --- Pretty header values (used in the group header) ---
    get headerCheckIn() {
        return this.formatDatePretty(this.filters.startDate);
    }
    get headerCheckOut() {
        // prefer an explicit endDate, else compute start + nights
        if (this.filters.endDate) return this.formatDatePretty(this.filters.endDate);
        if (!this.filters.startDate || !this.filters.durationNights) return '—';
        const d = new Date(this.filters.startDate);
        const nights = parseInt(this.filters.durationNights, 10) || 0;
        d.setDate(d.getDate() + nights);
        return this.formatDatePretty(d.toISOString().slice(0, 10));
    }
    get headerNights() {
        const n = this.filters.durationNights || '0';
        return `${n} (Nights)`;
    }
    get headerRooms() {
        const r = this.filters.quantityRooms || '0';
        return `${r} (Rooms)`;
    }
    get headerLocation() {
        return this.filters.location || '—';
    }
    get headerSupplierStatus() {
        // human-friendly label from filter (fallback to em dash)
        const m = { '': 'Any', PF: 'Preferred', PP: 'Pre-paid / Voucher' };
        return m[this.filters.supplierStatus ?? ''] || '—';
    }

    get headerStarRating() {
        const r = { '': 'Any', '5 Star': '5 Star', '4 Star': '4 Star', '3 Star': '3 Star' }
        return r[this.filters.starRating ?? ''] || '-';
    }

    // date formatting used by header
    formatDatePretty(isoLike) {
        if (!isoLike) return '—';
        const d = new Date(isoLike);
        if (isNaN(d)) return '—';
        return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }); // e.g., 1 May 2025
    }


    showToast(title, message, variant) {
        this.dispatchEvent(new ShowToastEvent({ title, message, variant }));
    }
}
