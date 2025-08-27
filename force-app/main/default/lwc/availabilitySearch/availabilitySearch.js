import { LightningElement, track } from 'lwc';
import getOptions from '@salesforce/apex/AvailabilitySearchController.getOptions';
import getSupplier from '@salesforce/apex/AvailabilitySearchController.getSupplier';

const CURRENCY = 'ZAR'; // API returns ZAR in your sample

export default class AvailabilitySearch extends LightningElement {
    @track filters = {
        serviceType: '',
        startDate: '',
        durationNights: '4',
        endDate: '',
        quantityRooms: '1',
        location: '',
        starRating: '',
        supplierStatus: '',
        attractions: '',
        liveAvailability: '',
        supplierName: ''
    };

    @track toolbar = {
        supplierName: '',
        startDate: '',
        duration: '4',
        qty: '1',
        location: '',
        supplierStatus: ''
    };

    @track rows = [];
    loading = false;
    error;

    // ----- Combobox options (match the screenshot) -----
    get serviceTypeOptions() {
        return [
            { label: 'Select', value: '' },
            { label: 'Accommodation', value: 'accommodation' },
            { label: 'Transfer', value: 'transfer' },
            { label: 'Activity', value: 'activity' }
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
            { label: '5 Star', value: '5ST' },
            { label: '4 Star', value: '4ST' },
            { label: '3 Star', value: '3ST' }
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
        console.log(`Input change: ${name} = ${value}`);
        this.filters = { ...this.filters, [name]: value };
    };
    handleToolbar = (e) => {
        const { label, value } = e.target;
        const map = {
            'Supplier Name': 'supplierName',
            'Start Date': 'startDate',
            'Duration (Nights)': 'duration',
            'Quantity (Rooms)': 'qty',
            'Location': 'location',
            'Supplier Status': 'supplierStatus'
        };
        const key = map[label] || e.target.name;
        this.toolbar = { ...this.toolbar, [key]: value };
        this.applyClientFilter();
    };

    async handleSearch() {
        this.loading = true;
        this.error = undefined;
        this.rows = [];
        try {
            console.log(`Search initiated with filters: ${JSON.stringify(this.filters)}`);
            const supplier = await getSupplier({ supplierName: this.filters.supplierName });
            console.log('Supplier fetched:', supplier);
            const body = await getOptions({ filters: { ...this.filters } });
            const raw = JSON.parse(body); // API returns array with { result: [...] }
            this.rows = this.transformApiData(raw);
            this.applyClientFilter();
        } catch (err) {
            // Surface a friendly error
            this.error = (err && err.body && err.body.message) ? err.body.message : (err?.message || 'Unexpected error');
            this.rows = [];
        } finally {
            this.loading = false;
        }
    }

    transformApiData(payload) {
        // payload looks like: [ { result: [ {...} ] } ]
        if (!Array.isArray(payload) || !payload.length) return [];
        const results = payload[0]?.result || [];
        const rows = [];

        results.forEach((opt) => {
            const gen = opt.OptGeneral || {};
            const supplier = gen.SupplierName || '';
            const desc = gen.Description || '';
            const locality = gen.LocalityDescription || gen.Locality || '';
            const star = gen.ClassDescription || gen.Class || '';

            const childPolicy = this.composeChildPolicy(gen);
            const service = `${desc} - ${supplier}`;
            const rateCategory = star ? `Contract net rate with ${star.toLowerCase()}` : 'Contract net rate';
            const optStay = (opt.OptStayResults || []).map(s => this.mapStayToRow(s, supplier, desc, locality, childPolicy));
            rows.push(...optStay);
        });

        // Add an id for keying rows
        return rows.map((r, i) => ({ ...r, id: `${i}` }));
    }

    mapStayToRow(stay, supplier, desc, locality, childPolicy) {
        const availability = (stay.Availability || '').toUpperCase();
        const statusMap = { OK: 'Available', RQ: 'On Request', NA: 'Unavailable' };
        const status = statusMap[availability] || availability || '—';

        // Nett/Sell: if your business needs a different rule, tweak here
        const nett = this.formatMoney(stay.AgentPrice || stay.TotalPrice);
        const sell = this.formatMoney(stay.TotalPrice || stay.AgentPrice);

        const rateText = stay.RateText || (stay.ExternalRateDetails?.ExtRatePlanDescr) || '';
        const externalDescr = stay.ExternalRateDetails?.ExtOptionDescr || '';

        return {
            service: `${desc} - ${supplier}`,
            rateCategory: externalDescr ? (stay.RateName || 'Wholesale') : 'Contract net rate with breakfast',
            rateDescription: rateText || '—',
            childPolicy,
            inCancellation: this.cancelWindow(stay.CancelHours),
            nett,
            sell,
            status,
            statusClass: `slds-truncate ${availability === 'OK' ? 'slds-text-color_success' :
                availability === 'RQ' ? 'slds-text-color_warning' : 'slds-text-color_error'}`,
            addDisabled: availability !== 'OK'
        };
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
        const val = Number(amount) / 100; // your sample looks like cents
        if (!Number.isFinite(val)) return '';
        return `${CURRENCY}${val.toLocaleString()}`;
    }

    applyClientFilter() {
        // Filter by Supplier name/location etc. (simple contains matching)
        const { supplierName, location } = this.toolbar;
        const rows = this.rows.map(r => ({ ...r, _include: true }));
        const filtered = rows.filter(r => {
            const supOk = supplierName ? r.service.toLowerCase().includes(supplierName.toLowerCase()) : true;
            const locOk = location ? r.service.toLowerCase().includes(location.toLowerCase()) : true;
            return supOk && locOk;
        });
        this.rows = filtered;
    }

    handleAdd(event) {
        const rowId = event.currentTarget.dataset.rowId;
        const row = this.rows.find(r => r.id === rowId);
        if (!row) { return; }
        this.dispatchEvent(new CustomEvent('additem', { detail: row }));
    }
}
