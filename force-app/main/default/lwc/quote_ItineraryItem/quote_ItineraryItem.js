import { LightningElement, api, track } from 'lwc';
import { ShowToastEvent } from 'lightning/platformShowToastEvent';
import { RefreshEvent } from "lightning/refresh";
import { generateOptionList, removeTags, helpTextLabels } from 'c/quote_ItineraryHelper';
import GetServiceTypes from '@salesforce/apex/QuoteLineItemController.getServiceTypes';
import GetServiceTypeForSupplier from '@salesforce/apex/QuoteLineItemController.GetServiceTypeForSupplier';
import GetLocations from '@salesforce/apex/QuoteLineItemController.getLocations'
import GetLocationForSupplier from '@salesforce/apex/QuoteLineItemController.GetLocationForSupplier'
import GetServiceDetails from '@salesforce/apex/QuoteLineItemController.getServiceDetails'
import GetQuotationPassengers from '@salesforce/apex/QuoteLineItemController.GetQuotationPassengers'
import GetQuoteById from '@salesforce/apex/QuoteLineItemController.GetQuoteById'
import GetOptByExternalId from '@salesforce/apex/QuoteLineItemController.GetOptByExternalId'
import GetOptIdsForServiceLineItem from '@salesforce/apex/QuoteLineItemController.GetOptIdsForServiceLineItem'
import GetExtraFieldMap from '@salesforce/apex/QuoteLineItemController.getExtraFieldMap'
import GetCrmCategoryByCrmCode from '@salesforce/apex/QuoteLineItemController.getCrmCategoryByCrmCode'
import GetServiceStatus from '@salesforce/apex/QuoteLineItemController.getServiceStatus'
import SaveQuoteLineItem from '@salesforce/apex/QuoteLineItemController.saveQuoteLineItem'
import updateQuoteLineItem from '@salesforce/apex/QuoteLineItemController.updateQuoteLineItem';
import UpdateLogistics from '@salesforce/apex/QuoteLineItemController.updateLogistics';
import GetCostMarkups from '@salesforce/apex/QuoteLineItemController.getCostMarkups'
import GetQuoteLineItemDetail from '@salesforce/apex/QuoteLineItemController.getQuoteLineItemDetail'
import GetSelectedSupplierByCode from '@salesforce/apex/QuoteLineItemController.getSelectedSupplierByCode'
import GetTimeList from '@salesforce/apex/QuoteLineItemController.getTimeList';
import GetTicketClassOptions from '@salesforce/apex/QuoteLineItemController.getTicketClassOptions'
import ValidateServiceByDay from '@salesforce/apex/QuoteLineItemController.validateServiceByDay'
import GetServiceTypeConfigurationByLabel from '@salesforce/apex/QuoteLineItemController.getServiceTypeConfigurationByLabel'
import GetQuoteLineItemByParentRef from '@salesforce/apex/QuoteLineItemController.getQuoteLineItemByParentRef'
import GetREEmailAddresses from '@salesforce/apex/QuoteLineItemController.getREEmailAddresses';
import GetSupplierServiceNotes from '@salesforce/apex/QuoteLineItemController.getSupplierServiceNotes';
import UpdateQuoteLineItemWithRateStatus from '@salesforce/apex/QuoteLineItemController.updateQuoteLineItemWithRateStatus';
import DeleteExistingQuoteLineItems from '@salesforce/apex/QuoteLineItemController.deleteExistingQuoteLineItems';

export default class quote_ItineraryItem extends LightningElement {

    helpTextLabels = helpTextLabels;
    //activeSections = ['cost-markups'];

    selectedSuppiler;
    selectedSupplierId;
    @api quoteId;
    @api quoteLineItemId = null;
    @api newCardStartDate = null;
    @api quoteLocked = false;
    @api costMarkupLocked = false;
    @api logisticsLocked = false;
    quoteLineItemDetail;
    quoteLineItemList;
    crmCode;
    quoteData;
    @track travelStartDate = this.newCardStartDate;
    @track travelEndDate = this.newCardStartDate;
    optDetail;
    @track isLoading = false;
    collapsed = false;
    showCardDetail = false;
    @track isOpenModal = false;
    @track isOpenCostMarkupModal = false;
    @api addOns = [];

    mode = '!Edit';

    @track selectedServiceType;
    @track serviceTypeOptions = [];
    @track selectedServiceLocation;
    @track serviceLocaitonOptions = [];
    @track selectedServiceDetail;
    @track serviceDetailOptions = [];
    @track duration;
    @track displayDuration;
    @track durationOptions = [];
    @track quantity;
    @track quantityOptions = [];
    @track startDate;
    passengers;
    availablePAX;
    configurationLabel;
    @track reservationStatus = "Not Booked";
    @track reservationStatusOptions = [];
    @track reservationNumber;
    @track changeSupplierDisplayName = "-";
    @track changeServiceDisplayName;
    @track overridenPolicy = false;
    quoteLineItemConfigurations;
    quoteLineItemConfigurationErrorMessage;

    openEmailModal = false;
    supplierToEmailAddress;

    serviceTypeMetadata;
    get durationLabel() {
        if (this.serviceTypeMetadata) {
            return this.serviceTypeMetadata.Duration_Label__c;
        }

        return 'Duration';
    };
    get quantityLabel() {
        if (this.serviceTypeMetadata) {
            return this.serviceTypeMetadata.Quantity_Label__c;
        }

        return 'Quantity';
    }

    hasLogistics = false;
    timeOptions = [];
    globalSearch = false;
    startLocation;
    endLocation;
    @track startTime;
    @track endTime;

    @track inputClassList = 'item-field slds-size_1-of-4';
    get isFlightCard() {
        if (this.selectedServiceType == 'Flight') {
            this.inputClassList = 'item-field slds-size_1-of-2'
            return true;
        }
        this.inputClassList = 'item-field slds-size_1-of-4'
        return false;
    }
    get isExtraCard() {
        if (this.selectedServiceType == 'Extra') {
            return true;
        }
        return false;
    }

    serviceDayWarningMessage;
    get validateServiceDay() {
        if (this.serviceTypeMetadata) {
            return this.serviceTypeMetadata.ValidateServiceDay__c;
        }

        return false;
    }

    airline;
    flightNumber;
    departureAirport;
    arrivalAirport;
    departureTime;
    arrivalTime;
    pnr;
    ticketClass;
    ticketClassOptions = [];
    luggageAllowance;

    get isLogisticsCard() {
        if (this.selectedSuppiler && this.selectedSuppiler.id != "" && this.optDetail != null && this.serviceTypeMetadata != null) {
            if (this.selectedServiceLocation != null && this.selectedServiceDetail != null && this.duration != null && this.quantity != null) {
                return this.serviceTypeMetadata.hasLogistics__c;
            }
        }
        return false;
    }

    get supplierConfigured() {
        if (this.selectedSuppiler && this.selectedSuppiler.id != "" && this.optDetail != null && this.serviceTypeMetadata != null) {
            if (this.selectedServiceLocation != null && this.selectedServiceDetail != null && this.duration != null && this.quantity != null) {
                this.configurationLabel = this.serviceTypeMetadata.Configuration_Label__c;
                this.hasLogistics = this.serviceTypeMetadata.hasLogistics__c;
                return true;
            }

        }
        return false;
    }

    get hasQuoteLineItem() {
        if (this.quoteLineItemId != null && this.quoteLineItemId != '' && this.quoteLineItemId.length == 18) {
            return true;
        }
        return false;
    }

    get isLogisticsEditable() {
        if (this.selectedSuppiler && this.selectedSuppiler.id != "" && this.optDetail != null && this.serviceTypeMetadata != null) {
            if (this.selectedServiceLocation != null && this.selectedServiceDetail != null && this.duration != null && this.quantity != null) {
                return this.serviceTypeMetadata.Editable_Logistics__c && !this.logisticsLocked;
            }
        }
    }

    @track serviceInclusionNote;
    @track serviceExclusionNote;
    @track supplierDescription;
    @track serviceDescription;

    costMarkup;
    @track rateStatus = null;
    get hasCostMarkup() {
        if (this.costMarkup != null) {
            return true;
        }
        return false;
    }
    get hasRateAcceptedRejected() {
        ////console.log('hasRateAcceptedRejected>>>', this.overridenPolicy, this.rateStatus);
        if (this.overridenPolicy == true && this.rateStatus == null) {
            return false;
        }
        return true;
    }

    saveDisabled = false;
    costMarkupDisabled = false;
    shouldUpdateCharge = false;
    updateLogisticsDisabled = false;

    connectedCallback() {
        this.isLoading = true;
        ////console.log('newCardStartDate>>>', this.newCardStartDate);
        this.selectedSuppiler = {};
        if (this.quoteLineItemId != null && this.quoteLineItemId != '' && this.quoteLineItemId.length == 18) {
            this.saveDisabled = true;
            this.costMarkupDisabled = true;
            this.updateLogisticsDisabled = true;
        } else {
            this.showCardDetail = true;
        }
        GetQuoteById({ quoteId: this.quoteId })
            .then(result => {
                ////console.log('Quote>>' + result);
                this.quoteData = result[0];
                console.log('quoteData>>>', JSON.parse(JSON.stringify(this.quoteData)));
                if (this.newCardStartDate != undefined && this.newCardStartDate != null) {
                    this.startDate = this.newCardStartDate;
                } else {
                    this.startDate = this.quoteData.TravelStartDate__c;
                }
                this.travelStartDate = this.quoteData.TravelStartDate__c;
                this.travelEndDate = this.quoteData.TravelEndDate__c;

            }).catch(error => {

                ////console.log('Error>>>::', JSON.stringify(error));
            })
        GetQuotationPassengers({ quotationId: this.quoteId })
            .then(result => {
                this.passengers = result;
                this.availablePAX = this.passengers.length;
                if (this.quoteLineItemId != null && this.quoteLineItemId != '' && this.quoteLineItemId.length == 18) {
                    this.prePopulateCard();
                }
                else {
                    GetServiceTypes()
                        .then(result => {
                            this.serviceTypeOptions = generateOptionList(result)
                        })
                        .catch(error => {
                            //console.log('Error>>>::', JSON.stringify(error));
                        })
                    this.isLoading = false;
                }

            })
            .catch(error => {
                //console.log('Error>>>::', JSON.stringify(error));

            })


        GetTicketClassOptions()
            .then(result => {
                this.ticketClassOptions = generateOptionList(result);
                this.ticketClass = "Economy";
            })
    }
    enableSaveButton() {
        //console.log('quoteLocked>>>', this.quoteLocked);
        if (!this.quoteLocked) {
            this.saveDisabled = false;
            this.showCardDetail = true;
        }
        if (!this.costMarkupLocked) {
            this.costMarkupDisabled = false;
            this.showCardDetail = true;
        }
        console.log('updateLogisticsDisabled>>>', this.updateLogisticsDisabled);
        console.log('logisticsLocked>>>', this.logisticsLocked);
        if (!this.logisticsLocked) {
            this.updateLogisticsDisabled = false;
        }
    }
    prePopulateCard() {
        GetQuoteLineItemDetail({ quoteLineItemId: this.quoteLineItemId })
            .then(result => {
                this.quoteLineItemDetail = result;
                this.crmCode = this.quoteLineItemDetail.Crm_Code__c;
                this.selectedSuppiler["externalId"] = this.quoteLineItemDetail.Selected_OPT_ExternalId__c;

                ////console.log('quoteLineItem:', JSON.parse(JSON.stringify(this.quoteLineItemDetail)));
                GetSelectedSupplierByCode({ code: this.quoteLineItemDetail.Crm_Code__c })
                    .then(result => {
                        this.selectedSupplierId = result.Id;
                        this.selectedSuppiler = {
                            ...this.selectedSuppiler,
                            id: result.Id,
                            mainField: result.NAME__c,
                            crmCode: this.quoteLineItemDetail.Crm_Code__c
                        };
                        this.startDate = this.quoteLineItemDetail.Service_Date__c;
                        ////console.log('crm:', result);


                        GetOptByExternalId({ externalId: this.quoteLineItemDetail.Selected_OPT_ExternalId__c })
                            .then(result => {
                                ////console.log('OPT>>' + JSON.stringify(result));
                                this.optDetail = result;
                                ////console.log('GetServiceTypeForSupplier');
                                this.GetServiceTypeForSupplier(this.quoteLineItemDetail.Service_Type__c);
                                this.selectedServiceType = this.quoteLineItemDetail.Service_Type__c;
                                this.GetLocationForSupplier(this.quoteLineItemDetail.ServiceLocation__c);
                                this.selectedServiceLocation = this.quoteLineItemDetail.ServiceLocation__c;
                                ValidateServiceByDay({ selectedOPT: this.optDetail.ExternalId__c, serviceType: this.selectedServiceType, serviceDate: this.startDate, duration: this.optDetail.PERIODS__c })
                                    .then(result => {
                                        ////console.log("ValidateServiceByDay>>result", result);
                                        this.serviceDayWarningMessage = result;
                                    })
                                    .catch(error => {
                                        ////console.log('ValidateServiceByDay>>Error>>>::', JSON.stringify(error));
                                    })
                                GetServiceTypeConfigurationByLabel({ serviceType: this.selectedServiceType })
                                    .then(result => {
                                        this.serviceTypeMetadata = result;
                                        ////console.log('GetServiceTypeConfigurationByLabel>>result>>', JSON.stringify(result));
                                        GetServiceDetails({
                                            selectedSupplierName: this.selectedSuppiler.mainField,
                                            selectedServiceType: this.quoteLineItemDetail.Service_Type__c,
                                            selectedLocation: this.quoteLineItemDetail.ServiceLocation__c,
                                        })
                                            .then(result => {
                                                ////console.log('GetServiceDetails::::', result);
                                                this.serviceDetailOptions = generateOptionList(result)
                                                this.selectedServiceDetail = this.quoteLineItemDetail.Service_Detail__c;
                                                this.displayDuration = this.quoteLineItemDetail.Display_Duration__c;
                                                this.setupDuration(this.quoteLineItemDetail.Service_Duration__c);
                                                // this.duration = this.quoteLineItemDetail.Service_Duration__c;
                                                this.setupQuantity(this.quoteLineItemDetail.Quantity__c);
                                                // this.quantity = this.quoteLineItemDetail.Quantity__c;
                                                this.reservationStatus = this.selectedServiceDetail.Service_Status__c;
                                                this.reservationNumber = this.selectedServiceDetail.Reservation_Number__c;
                                                this.changeSupplierDisplayName = this.quoteLineItemDetail.SupplierName__c;
                                                this.changeServiceDisplayName = this.quoteLineItemDetail.Service_Detail_Display_Name__c;
                                                this.supplierDescription = this.quoteLineItemDetail.Supplier_Description__c;
                                                this.serviceDescription = this.quoteLineItemDetail.Service_Description__c;
                                                this.serviceInclusionNote = this.quoteLineItemDetail.Service_Inclusion__c;
                                                this.serviceExclusionNote = this.quoteLineItemDetail.Service_Exclusion__c;
                                                this.getServiceStatusOptions(this.quoteLineItemDetail.Service_Status__c);

                                                //logistics section
                                                this.startLocation = this.quoteLineItemDetail.Start_Location__c;
                                                this.startTime = this.quoteLineItemDetail.Start_Time__c;
                                                this.endLocation = this.quoteLineItemDetail.End_Location__c;
                                                this.endTime = this.quoteLineItemDetail.End_Time__c;

                                                //flight detial section
                                                this.airline = this.quoteLineItemDetail.Airline__c;
                                                this.flightNumber = this.quoteLineItemDetail.Flight_Number__c;
                                                this.departureAirport = this.quoteLineItemDetail.Departure_Airport__c;
                                                this.departureTime = this.quoteLineItemDetail.Departure_Time__c;
                                                this.arrivalAirport = this.quoteLineItemDetail.Arrival_Airport__c;
                                                this.arrivalTime = this.quoteLineItemDetail.Arrival_Time__c;
                                                this.pnr = this.quoteLineItemDetail.PNR_Number__c;
                                                this.ticketClass = this.quoteLineItemDetail.Ticket_Class__c;
                                                this.luggageAllowance = this.quoteLineItemDetail.Luggage_Allowance_and_Weight_Restriction__c;

                                                this.overridenPolicy = this.quoteLineItemDetail.Override_Supplier_Policy__c;
                                                this.rateStatus = this.quoteLineItemDetail.Rate_Acceptance_Status__c;
                                                this.prepareExtras();

                                                GetCostMarkups({ QuoteLineItemId: this.quoteLineItemId })
                                                    .then(result => {
                                                        this.costMarkup = result;
                                                        ////console.log('GetCostMarkups>>' + JSON.parse(JSON.stringify(result)));
                                                        this.isLoading = false;

                                                    })
                                                    .catch(error => {
                                                        //console.log('GetCostMarkups>>Error>>>::', JSON.stringify(error));
                                                        this.isLoading = false;
                                                    })

                                            })
                                            .catch(error => {
                                                //console.log('GetServiceDetails>>Error>>>::', JSON.stringify(error));
                                                this.isLoading = false;
                                            })
                                        GetREEmailAddresses({ code: this.selectedSuppiler.crmCode })
                                            .then(result => {
                                                this.supplierToEmailAddress = result;
                                            })
                                            .catch(error => {
                                                //console.log('GetREEmailAddresses>>Error>>>::', JSON.stringify(error));
                                            })
                                    })
                                    .catch(error => {
                                        //console.log("GetServiceTypeConfigurationByLabel>>Error>>", JSON.stringify(error));
                                    })

                            })
                            .catch(error => {
                                //console.log('GetOptByExternalId>>Error>>>::', JSON.stringify(error));
                            })
                            .finally(() => {

                            })
                    })
                    .catch(error => {
                        //console.log('GetSelectedSupplierByCode>>Error>>>::', JSON.stringify(error));
                        this.isLoading = false;

                    })
                GetQuoteLineItemByParentRef({ parentQuoteLineItemId: this.quoteLineItemId })
                    .then(result => {
                        ////console.log('GetQuoteLineItemByParentRef>>Result>>', JSON.stringify(result));
                        this.quoteLineItemList = result;
                        for (let item of this.quoteLineItemList) {
                            item.label = 'Day ' + item.Day_Order__c + ', ' + item.Service_Date__c;
                        }
                    })
                    .catch(error => {
                        //console.log('getQuoteLineItemByParentRef>>Error>>', JSON.stringify(error));
                    })
            })
            .catch(error => {
                //console.log('GetQuoteLineItemDetail>>Error>>>::', JSON.stringify(error));
                this.isLoading = false;

            })
    }

    handleLookupValueSelected(event) {
        this.isLoading = true;
        this.selectedSuppiler = event.detail;
        this.changeSupplierDisplayName = this.selectedSuppiler.supplierName;
        ////console.log('selected supplier:::', JSON.parse(JSON.stringify(this.selectedSuppiler)));
        if (this.selectedSuppiler.serviceType != '' && this.selectedSuppiler.serviceLocation != '') {
            this.serviceTypeOptions = [{ label: this.selectedSuppiler.serviceType, value: this.selectedSuppiler.serviceType }];
            this.selectedServiceType = this.selectedSuppiler.serviceType;
            this.serviceLocaitonOptions = [{ label: this.selectedSuppiler.serviceLocation, value: this.selectedSuppiler.serviceLocation }]
            this.selectedServiceLocation = this.selectedSuppiler.serviceLocation;
            this.serviceDetailOptions = [{ label: this.selectedSuppiler.subField, value: this.selectedSuppiler.subField }]
            this.selectedServiceDetail = this.selectedSuppiler.subField;
            this.changeServiceDisplayName = this.selectedServiceDetail;
            this.crmCode = this.selectedSuppiler.crmCode;

            GetOptByExternalId({ externalId: this.selectedSuppiler.externalId })
                .then(result => {
                    ////console.log('GetOptByExternalId>>', JSON.parse(JSON.stringify(result)));
                    this.optDetail = result;
                    ValidateServiceByDay({ selectedOPT: this.optDetail.ExternalId__c, serviceType: this.selectedServiceType, serviceDate: this.startDate, duration: this.optDetail.PERIODS__c })
                        .then(result => {
                            ////console.log("ValidateServiceByDay>>result", result);
                            this.serviceDayWarningMessage = result;
                        })
                        .catch(error => {
                            ////console.log('ValidateServiceByDay>>Error>>>::', JSON.stringify(error));
                        })
                })
                .catch(error => {
                    // //console.log('GetOptByExternalId>>Error>>>::', JSON.stringify(error));
                }).finally(() => {
                    GetServiceTypeConfigurationByLabel({ serviceType: this.selectedServiceType })
                        .then(result => {
                            this.serviceTypeMetadata = result;
                            // //console.log('GetServiceTypeConfigurationByLabel>>result>>', JSON.stringify(result));
                        })
                        .catch(error => {
                            // //console.log("GetServiceTypeConfigurationByLabel>>Error>>", JSON.stringify(error));
                        })
                        .finally(() => {
                            this.onServiceTypeChange();
                        })

                })
        } else {

            this.GetServiceTypeForSupplier();
            this.GetLocationForSupplier();


        }
        this.isLoading = false;
        //console.log('finish-10');

    }

    GetServiceTypeForSupplier(serviceType) {
        //Get service types
        GetServiceTypeForSupplier({ supplierId: this.selectedSuppiler.id }).then(result => {
            // //console.log('servicetpyes:', result);
            this.serviceTypeOptions = generateOptionList(result);
            if (serviceType) {
                this.selectedServiceType = serviceType;
                //console.log(this.selectedServiceType);
            }
        }).catch(error => {
            //console.log(error)
        })
    }

    GetLocationForSupplier(serviceLocation) {
        //Get locations
        GetLocationForSupplier({ supplierIdorCode: this.selectedSuppiler.id, mode: this.mode }).then(result => {
            // //console.log("locations::", result);
            this.serviceLocaitonOptions = generateOptionList(result);
            if (serviceLocation) {
                this.selectedServiceLocation = serviceLocation;
            }
        }).catch(error => { //console.log(JSON.parse(JSON.stringify(error))); 
        })
    }

    handleLookupValueCancel(event) {
        this.isLoading = true;
        this.selectedSuppiler = event.detail;
        if (this.selectedSuppiler.id == '') {
            this.serviceTypeOptions = [];
            this.selectedServiceType = null;
            this.serviceLocaitonOptions = []
            this.selectedServiceLocation = null
            this.serviceDetailOptions = []
            this.selectedServiceDetail = null
            this.optDetail = null;
            this.addOns = [];
            this.changeSupplierDisplayName = '-'
            GetServiceTypes()
                .then(result => {
                    this.serviceTypeOptions = generateOptionList(result)
                }).catch(error => {
                    //console.log('Error>>>::', JSON.stringify(error));
                })
        }

        this.isLoading = false;
    }

    handleChangeServiceType(event) {
        this.isLoading = true;


        this.selectedServiceType = event.target.value
        // //console.log('handleChangeServiceType>>' + this.selectedServiceType);

        if (this.selectedSuppiler) {
            GetLocationForSupplier({ supplierIdorCode: this.selectedSuppiler.id, mode: this.mode }).then(result => {
                this.serviceLocaitonOptions = generateOptionList(result);
            }).catch(error => { //console.log(JSON.parse(JSON.stringify(error))); 
            })
        } else {
            GetLocations({
                selectedServiceType: this.selectedServiceType
            }).then(result => {
                // //console.log('GetLocations>>' + result);
                this.serviceLocaitonOptions = generateOptionList(result);
            }).catch(error => { //console.log(JSON.parse(JSON.stringify(error)));
            })
        }
        this.selectedServiceDetail = null
        this.selectedServiceLocation = null
        GetServiceTypeConfigurationByLabel({ serviceType: event.target.value })
            .then(result => {
                this.serviceTypeMetadata = result;
                // //console.log('GetServiceTypeConfigurationByLabel>>result>>', JSON.stringify(result));
            })
            .catch(error => {
                //console.log("GetServiceTypeConfigurationByLabel>>Error>>", JSON.stringify(error));
            }).finally(() => {
                this.onServiceTypeChange();
            })

        this.isLoading = false;
    }

    handleChangeLocation(event) {
        this.isLoading = true;
        this.selectedServiceLocation = event.target.value;
        //console.log('inside handleChangeLocation');
        if (this.selectedSuppiler && this.selectedSuppiler.id != '') {

            GetServiceDetails({
                selectedSupplierName: this.selectedSuppiler.mainField,
                selectedServiceType: this.selectedServiceType,
                selectedLocation: this.selectedServiceLocation
            }).then(result => {
                //console.log('GetServiceDetails::::', result);
                this.serviceDetailOptions = generateOptionList(result)
            })
                .catch(error => {
                    //console.log('Error>>>::', JSON.stringify(error));
                })
        }
        this.isLoading = false;
    }

    handleChangeServiceDetail(event) {
        this.isLoading = true;
        let selectedServiceDetail = event.target.value;
        let selectedServiceDetailList = selectedServiceDetail.split('||');
        GetOptIdsForServiceLineItem({
            selectedServiceType: this.selectedServiceType,
            selectedLocation: this.selectedServiceLocation,
            selectedSupplierName: this.selectedSuppiler.mainField,
            selectedServiceDetailbeforeSplit: selectedServiceDetailList[0].trim(),
            selectedServiceCommentsAfterSplit: selectedServiceDetailList.length > 1 ? selectedServiceDetailList[1].trim() : null
        })
            .then(result => {
                this.optDetail = result;
                //console.log('GetOptIdsForServiceLineItem>>' + this.optDetail);
                this.selectedServiceDetail = selectedServiceDetail;
                this.changeServiceDisplayName = this.selectedServiceDetail;
                ValidateServiceByDay({ selectedOPT: this.optDetail.ExternalId__c, serviceType: this.selectedServiceType, serviceDate: this.startDate, duration: this.optDetail.PERIODS__c })
                    .then(result => {
                        //console.log("ValidateServiceByDay>>result", result);
                        this.serviceDayWarningMessage = result;
                    })
                    .catch(error => {
                        //console.log('ValidateServiceByDay>>Error>>>::', JSON.stringify(error));
                    })
                // this.getServiceNotes();
                // this.getServiceStatusOptions();
            })
            .catch(error => {
                //console.log('GetOptIdsForServiceLineItem>>Error>>>::', JSON.stringify(error));
            }).finally(() => {
                this.onServiceTypeChange();

            })

        this.isLoading = false;
    }

    getOptByServiceDetail() {
        let selectedServiceDetailList = this.selectedServiceDetail.split('||');
        GetOptIdsForServiceLineItem({
            selectedServiceType: this.selectedServiceType,
            selectedLocation: this.selectedServiceLocation,
            selectedSupplierName: this.selectedSuppiler.mainField,
            selectedServiceDetailbeforeSplit: selectedServiceDetailList[0],
            selectedServiceCommentsAfterSplit: selectedServiceDetailList.length > 1 ? selectedServiceDetailList[1] : null
        })
            .then(result => {
                //console.log('getOptByServiceDetail>>' + JSON.parse(JSON.stringify(result)));
                this.optDetail = result;
            })
            .catch(error => {
                //console.log('Error>>>::', JSON.stringify(error));
            })
    }

    handleCollapsed() {
        this.collapsed = !this.collapsed
    }

    onServiceTypeChange() {
        this.setupQuantity(null);
        this.setupDuration(null);
        if (this.optDetail) {
            this.getServiceNotes();
            this.getServiceStatusOptions();
            this.prepareExtras();

        }
        //console.log('finish-20');
    }

    setupQuantity(quantity) {
        this.quantityOptions = [];
        for (let i = 1; i < 21; i++) {
            let opt = { label: i, value: i };
            this.quantityOptions = [...this.quantityOptions, opt];
        }
        //console.log('quantityOptions---' + this.quantityOptions);
        if (quantity) {
            this.quantity = quantity;
        }
        else {
            if (this.serviceTypeMetadata) {
                if (this.serviceTypeMetadata.Default_Quantity_Config__c == 'Dynamic') {
                    if (this.availablePAX <= 2) {
                        this.quantity = 1;
                    }
                    else if (this.availablePAX <= 4) {
                        this.quantity = 2;
                    } else if (this.availablePAX <= 6) {
                        this.quantity = 3;
                    } else if (this.availablePAX <= 8) {
                        this.quantity = 4;
                    } else if (this.availablePAX <= 10) {
                        this.quantity = 5;
                    }
                }
                else if (this.serviceTypeMetadata.Default_Quantity_Config__c == 'Maximum') {
                    this.quantity = this.availablePAX;
                }
                else if (this.serviceTypeMetadata.Default_Quantity_Config__c == 'Default 1') {
                    this.quantity = 1;
                } else {

                }
            }
            else {
                this.quantity = 1;
            }


        }
        //console.log('finish-30');
    }

    setupDuration(duration) {
        this.durationOptions = []
        let lastOption;
        let firstOption = this.serviceTypeMetadata.Minimum_Duration__c;
        if (this.serviceTypeMetadata) {
            if (this.serviceTypeMetadata.Duration__c == 'Nights') {
                lastOption = this.calculateDurationLeft(this.startDate, this.quoteData.TravelEndDate__c);//this.quoteData.Total_Nights__c;
            }
            else if (this.serviceTypeMetadata.Duration__c == 'Days') {
                lastOption = this.calculateDurationLeft(this.startDate, this.quoteData.TravelEndDate__c);//this.quoteData.Total_Days__c;
            }
            else if (this.serviceTypeMetadata.Duration__c == 'Default 1') {
                lastOption = 1;
            }
        }
        //console.log('lastOption---' + lastOption);
        if (lastOption != null) {
            for (let i = firstOption; i <= lastOption; i++) {
                let opt = { label: i.toString(), value: i };
                this.durationOptions = [...this.durationOptions, opt];
            }
            //console.log('inside setup');
            if (duration) {
                //console.log('duration for quoteline');
                this.duration = duration;
            }
            else {
                if (this.serviceTypeMetadata && this.serviceTypeMetadata.IsDefualtDuration__c && this.optDetail) {
                    this.duration = this.optDetail.PERIODS__c;
                    this.displayDuration = this.optDetail.PERIODS__c;
                } else {
                    this.duration = 1;//this.serviceTypeMetadata.Minimum_Duration__c;
                    this.displayDuration = this.serviceTypeMetadata.Minimum_Duration__c;
                }
            }
            this.setEndDate();
        }
        //console.log('finish-40');
    }

    calculateDurationLeft(startDate, endDate) {
        let startDt = new Date(startDate);
        let endDt = new Date(endDate);
        let diff = endDt.getTime() - startDt.getTime();
        let days = Math.ceil(diff / (1000 * 3600 * 24));
        return days;
    }

    getServiceStatusOptions(currentStatus) {
        this.reservationStatusOptions = [];
        GetServiceStatus()
            .then(result => {
                //console.log('GetServiceStatus>>' + JSON.parse(JSON.stringify(result)));
                this.reservationStatusOptions = generateOptionList(result);
                if (currentStatus) {
                    this.reservationStatus = currentStatus;
                } else {
                    if (this.selectedServiceType == 'Extra') {
                        this.reservationStatus = "No Booking Required"
                        this.reservationNumber = 'N/A'
                    } else {
                        this.reservationStatus = this.reservationStatusOptions[0].value;
                    }

                }
                //console.log('reservation Options :: ', JSON.parse(JSON.stringify(this.reservationStatusOptions)));

            })
            .catch(error => {
                //console.log('Error:::', JSON.parse(JSON.stringify(error)));
            })
        //console.log('finish-60');
    }

    getServiceNotes() {
        GetSupplierServiceNotes({ crmCode: this.optDetail.CRM_Code__c, optCode: this.optDetail.ExternalId__c })
            .then(result => {
                //console.log('getServiceNotes>>' + JSON.stringify(result));
                if (result.OPI != undefined && result.OPX != null)
                    this.serviceInclusionNote = removeTags(result.OPI);
                if (result.OPX != undefined && result.OPX != null)
                    this.serviceExclusionNote = removeTags(result.OPX);
                if (result.OIN != undefined && result.OIN != null)
                    this.serviceDescription = removeTags(result.OIN);
                if (result.SIN != undefined && result.SIN != null)
                    this.supplierDescription = removeTags(result.SIN);
                //console.log('serviceDescription>>>', this.serviceDescription);
                //console.log('supplierDescription>>>', this.supplierDescription);

            })
            .catch(error => {
                //console.log('Error>>>::', JSON.stringify(error));
            })
        //console.log('finish-50');
    }

    handleChangeStartDate(event) {
        this.isLoading = true;
        this.startDate = event.target.value;
        if (this.duration != null) {
            this.setupDuration(this.duration);
            this.setEndDate();
        }
        this.isLoading = false;
    }

    handleChangeQuantity(event) {
        this.isLoading = true;
        this.quantity = parseInt(event.target.value);
        //console.log('handleChangeQuantity>>' + this.quantity);
        this.isLoading = false;
    }

    handleChangeDuration(event) {
        this.isLoading = true;
        this.displayDuration = parseInt(event.target.value);
        this.duration = parseInt(event.target.value);
        if (this.displayDuration == 0) {
            this.duration = 1;
        }
        this.setEndDate();
        this.isLoading = false;
    }

    setEndDate() {
        // console.log('setEndDate>>Duration>>' + this.displayDuration);
        let date = new Date(this.startDate);
        //var d = new Date() d = d.getUTCMonth()+'/'+d.getUTCDay()+'/'+d.getUTCFullYear();
        // console.log('setEndDate>>StartDate' + date);
        if (this.displayDuration != 0)
            date = new Date(date.setUTCDate(date.getUTCDate() + (this.displayDuration)));
        this.endDate = date.getUTCFullYear() + "-" + (date.getUTCMonth() + 1) + "-" + date.getUTCDate()
        // console.log('setEndDate>>' + this.endDate);
        // //console.log(this.endDate, '  ---  ', this.startDate);
    }


    handleChangeReservationStatus(event) {
        this.isLoading = true;
        this.reservationStatus = event.target.value;
        this.isLoading = false;
    }

    handleChangeReservationNumber(event) {
        this.isLoading = true;
        this.reservationNumber = event.target.value;
        this.isLoading = false;
    }

    handleChangeServiceDisplayName(event) {
        this.isLoading = true;
        this.changeServiceDisplayName = event.target.value;
        this.isLoading = false;
    }

    handleChnageSupplierDisplayName(event) {
        this.isLoading = true;
        this.changeSupplierDisplayName = event.target.value;
        this.isLoading = false;
    }

    openOverridePolicyModal(event) {
        //console.log('openOverridePolicyModal');
        this.isOpenModal = true;
    }

    handleCancelModal(event) {
        this.isOpenModal = false;
    }

    handleSaveModal(event) {
        this.overridenPolicy = true;
        this.isOpenModal = false;
    }

    prepareExtras() {
        GetExtraFieldMap({ targetObject: "OPT__c", sourceObject: "OPT__c" })
            .then(result => {
                //console.log('GetExtraFieldMap>>' + JSON.parse(JSON.stringify(result)));
                let extraFieldMap = result;
                let extras = [];
                for (let key in extraFieldMap) {
                    if (this.optDetail[key] != undefined && this.optDetail[key] != null) {
                        let extra = {};
                        extra.label = this.optDetail[key];
                        extra.name = key;
                        extra.checked = this.quoteLineItemDetail ? this.quoteLineItemDetail[key] : false;
                        let extraFlag = this.optDetail[extraFieldMap[key]];
                        if (extraFlag == "0" || extraFlag == "1") {
                            extra.required = true;
                            extra.checked = true;
                        } else {
                            extra.required = false;
                        }
                        extras.push(extra)

                    }
                }
                this.addOns = extras;

            })
            .catch(error => {
                //console.log('Error>>>::', JSON.stringify(error));
            })
        //console.log('finish-70');
    }

    handleAddOnChecked(event) {
        for (let item of this.addOns) {
            if (item.name == event.target.name) {
                item.checked = event.target.checked;
                //console.log('handleAddOnChecked>>' + JSON.parse(JSON.stringify(item)));
            }
        }
    }

    handleSupplierDescriptionChange(event) {
        this.supplierDescription = event.target.value;
    }

    handleServiceDescriptionChange(event) {
        this.serviceDescription = event.target.value;
    }

    handleInclusionNoteChange(event) {
        this.serviceInclusionNote = event.target.value;
    }

    handleExclusionNoteChange(event) {
        this.serviceExclusionNote = event.target.value;
    }

    handleGetConfigurationData(event) {
        this.quoteLineItemConfigurations = event.detail.configurationList;
        this.quoteLineItemConfigurationErrorMessage = event.detail.errorMessage;
        this.shouldUpdateCharge = this.shouldUpdateCharge || event.detail.isUpdated;
        //console.log('handleGetConfigurationData>>isUpdated' + event.detail.isUpdated);
        //console.log('handleGetConfigurationData>>' + this.quoteLineItemConfigurationErrorMessage);
        //console.log('quoteLineItemConfigurations:::', JSON.parse(JSON.stringify(this.quoteLineItemConfigurations)));
    }

    handleSaveService(event) {
        //console.log('before start');
        let hasError = this.validateInputs();
        if (hasError) {
            this.showToast('Required', 'Please fill up all required fields.');
        } else {
            this.isLoading = true;
            //if (this.cardsToBeSaved.includes(this.selectedServiceType)) {
            if (this.serviceTypeMetadata && this.serviceTypeMetadata.IsActive__c) {
                if (this.quoteLineItemConfigurationErrorMessage != null && this.quoteLineItemConfigurationErrorMessage != '') {
                    this.showToast(this.serviceTypeMetadata.Configuration_Label__c, this.quoteLineItemConfigurationErrorMessage);
                    this.isLoading = false;
                }
                else {
                    if (this.quoteLineItemId != null && this.quoteLineItemId != '' && this.quoteLineItemId.length == 18) {
                        if (this.crmCode != this.quoteLineItemDetail.Crm_Code__c ||
                            this.selectedSuppiler.externalId != this.quoteLineItemDetail.Selected_OPT_ExternalId__c ||
                            this.startDate != this.quoteLineItemDetail.Service_Date__c ||
                            this.duration.toString() != this.quoteLineItemDetail.Service_Duration__c.toString() ||
                            this.quantity.toString() != this.quoteLineItemDetail.Quantity__c.toString()
                        ) {
                            this.shouldUpdateCharge = true;
                        }
                        for (let item of this.addOns) {
                            if (item.checked != this.quoteLineItemDetail[item.name]) {
                                this.shouldUpdateCharge = true;
                                break;
                            }

                        }
                    }

                    let logistics = {
                        startLocation: this.startLocation,
                        endLocation: this.endLocation,
                        startTime: this.startTime,
                        endTime: this.endTime,
                    }
                    let flightDetail = {
                        airline: this.airline,
                        flightNumber: this.flightNumber,
                        departureAirport: this.departureAirport,
                        departureTime: this.departureTime,
                        arrivalAirport: this.arrivalAirport,
                        arrivalTime: this.arrivalTime,
                        pnr: this.pnr,
                        ticketClass: this.ticketClass,
                        luggageAllowance: this.luggageAllowance,
                    }

                    let params = {
                        serviceLineItemName: this.selectedSuppiler.supplierName,
                        selectedServiceType: this.selectedServiceType,
                        selectedLocation: this.selectedServiceLocation,
                        selectedSupplierName: this.changeSupplierDisplayName,
                        selectedSupplierId: this.selectedSuppiler.id,
                        selectedServiceDetail: this.selectedServiceDetail,
                        selectedServiceDetailDisplayName: this.changeServiceDisplayName,
                        quoteLineItemId: this.quoteLineItemId,
                        serviceReservationNumber: this.reservationNumber,
                        serviceSelectServiceStatus: this.reservationStatus,
                        serviceExpiryDate: null,
                        overrideDetails: false,
                        overridenSupplierPolicy: this.overridenPolicy,
                        serviceDate: this.startDate,
                        numberOfDays: this.duration,
                        displayDuration: this.displayDuration,
                        quoteId: this.quoteId,
                        roomConfigurations: this.quoteLineItemConfigurations,
                        logistics: logistics,
                        flightDetail: flightDetail,
                        oldChargeTypes: null,
                        keepRatesOnDateChange: true,
                        selectedOPT: this.optDetail.ExternalId__c,
                        addOns: this.addOns.map(item => {
                            if (item.checked) {
                                return item.name;
                            }
                        }),
                        serviceInclusionNote: this.serviceInclusionNote,
                        serviceExclusionNote: this.serviceExclusionNote,
                        supplierDescription: this.supplierDescription,
                        serviceDescription: this.serviceDescription

                    }
                    if (this.quoteLineItemId != null && this.quoteLineItemId != '' && this.quoteLineItemId.length == 18 && !this.shouldUpdateCharge) {
                        let updateParams = {
                            quoteLineItemId: this.quoteLineItemId,
                            logistics: logistics,
                            flightDetail: flightDetail,
                            serviceInclusionNote: this.serviceInclusionNote,
                            serviceExclusionNote: this.serviceExclusionNote,
                            supplierDescription: this.supplierDescription,
                            serviceDescription: this.serviceDescription
                        }
                        //console.log('updateQuoteLineItem>>' + JSON.stringify(updateParams));
                        updateQuoteLineItem(updateParams)
                            .then(result => {
                                //console.log('updateQuoteLineItem>>' + result);
                                if (result.length == 0) {
                                    const refreshEvent = new CustomEvent("refresh", {})
                                    this.dispatchEvent(refreshEvent);
                                    this.isLoading = false;
                                    this.saveDisabled = true;
                                    this.costMarkupDisabled = true;
                                } else {
                                    this.showToast('Error', result[0]);
                                    this.isLoading = false;
                                }
                            })
                            .catch(error => {
                                //console.log('Error>>>::', JSON.stringify(error));
                            })
                    } else {
                        SaveQuoteLineItem(params)
                            .then(result => {
                                console.log('SaveQuoteLineItem>>' + result);
                                if (result.length == 0) {
                                    const refreshEvent = new CustomEvent("refresh", {})
                                    this.dispatchEvent(refreshEvent);
                                    this.isLoading = false;
                                    this.saveDisabled = true;
                                    this.costMarkupDisabled = true;


                                } else {
                                    this.showToast('Error', result[0]);
                                    this.isLoading = false;
                                    //this.saveDisabled = true;

                                }
                            })
                            .catch(error => {
                                //console.log('Error>>>::', JSON.stringify(error));
                            })
                    }

                }
            } else {
                this.isLoading = false;
            }
        }

        //console.log('before finish');
    }

    handleUpdateLogistics(event) {
        let hasError = this.validateInputs();
        if (hasError) {
            this.showToast('Required', 'Please fill up all required fields.');
        }
        else {
            this.isLoading = true;
            let logistics = {
                startLocation: this.startLocation,
                endLocation: this.endLocation,
                startTime: this.startTime,
                endTime: this.endTime,
            }
            let params = {
                quoteLineItemId: this.quoteLineItemId,
                logistics: logistics
            }
            UpdateLogistics(params)
                .then(result => {
                    console.log('updateQuoteLineItem>>' + result);
                    if (result.length == 0) {
                        // const refreshEvent = new CustomEvent("refresh", {})
                        // this.dispatchEvent(refreshEvent);
                        this.isLoading = false;
                    } else {
                        this.showToast('Error', result[0]);
                        this.isLoading = false;
                    }
                }).catch(error => {
                    console.log('Error>>>::', JSON.stringify(error));
                });
        }

    }

    showToast(title, message, variant = "error", mode = "dismissable") {
        const event = new ShowToastEvent({
            title: title,
            message: message,
            variant: variant,
            mode: mode
        });
        this.dispatchEvent(event);
    }

    toggleSelectAllCostMarkup(event) {
        const toggleList = this.template.querySelectorAll('[data-name="costMarkupCheckbox"]');
        //console.log('toggleSelectAllCostMarkup>>' + toggleList.length);
        for (const toggleElement of toggleList) {
            toggleElement.checked = event.target.checked;
        }
        let costMarkupData = JSON.parse(JSON.stringify(this.costMarkup));
        for (let service of costMarkupData.costMarkups) {
            //let chargeTypesArray = JSON.parse(JSON.stringify(service.chargeTypes));
            for (let chargetype of service.chargeTypes) {
                chargetype.edit = event.target.checked;
            }
        }
        this.costMarkup = costMarkupData;
    }

    toggleChargeTypeCheckbox(event) {
        const recordId = event.currentTarget.dataset.recordId;
        const serviceId = event.currentTarget.dataset.serviceId;
        let value = event.target.value;
        let costMarkupData = JSON.parse(JSON.stringify(this.costMarkup));
        for (let service of costMarkupData.costMarkups) {
            if (service.recordId == serviceId) {
                for (let chargetype of service.chargeTypes) {
                    if (chargetype.chargeTypeId == recordId) {
                        chargetype.edit = event.target.checked;
                        break;
                    }
                }
                break;
            }
        }
        this.costMarkup = costMarkupData;
        const toggleList = this.template.querySelector('[data-name="selectAllCostMarkup"]');

    }

    validateInputs() {
        let hasError = false;
        const inputFields = this.template.querySelectorAll('.validate');
        for (let field of inputFields) {
            if (field.value == '' || field.value == null || field.value == undefined) {
                field.reportValidity();
                hasError = true;
            }
        }
        if (!hasError && this.hasLogistics && (!this.startLocation || !this.endLocation || !this.startTime || !this.endTime)) {
            hasError = true;
        }
        if (!hasError && this.isFlightCard && (!this.departureAirport || !this.arrivalAirport || !this.departureTime || !this.arrivalTime)) {
            hasError = true;
        }
        ////console.log("type=search>>>", this.template.querySelectorAll('[data-name="lookupField"]'));
        return hasError;
    }

    openEditCostMarkupModal(event) {
        this.isOpenCostMarkupModal = true;
    }

    handleCloseEditCostMarkupModal(event) {
        this.isOpenCostMarkupModal = false;
    }

    handleSaveEditCostMarkupModal(event) {
        this.isOpenCostMarkupModal = false;
        const refreshEvent = new CustomEvent("refresh", {})
        this.dispatchEvent(refreshEvent);

    }

    handleGlobalSearchChecked(event) {
        this.globalSearch = event.target.checked;
    }

    handleLogisticsLocationSelected(event) {
        let eventData = event.detail;
        if (eventData.type == 'StartLocation') {
            this.startLocation = eventData.location;
        } else if (eventData.type == 'EndLocation') {
            this.endLocation = eventData.location;
        } else {

        }
    }

    handleLogisticsLocationCancel(event) {
        let eventData = event.detail;
        if (eventData.type == 'StartLocation') {
            this.startLocation = '';
        } else if (eventData.type == 'EndLocation') {
            this.endLocation = '';
        } else {

        }
    }

    handleLogisticsTimeSelected(event) {
        let eventData = event.detail;
        if (eventData.type == 'StartTime') {
            this.startTime = eventData.time;
        } else if (eventData.type == 'EndTime') {
            this.endTime = eventData.time;
        } else {

        }
    }
    handleLogisticsTimeCancel(event) {
        let eventData = event.detail;
        if (eventData.type == 'StartTime') {
            this.startTime = '';
        } else if (eventData.type == 'EndTime') {
            this.endTime = '';
        } else {

        }
    }

    handleChangeAirline(event) {
        this.airline = event.target.value;
    }

    handleChangeFlightNumber(event) {
        this.flightNumber = event.target.value;
    }

    handleChangeAirline(event) {
        this.airline = event.target.value;
    }

    handleFlightAirportSelected(event) {
        let eventData = event.detail;
        if (eventData.type == 'StartLocation') {
            this.departureAirport = eventData.location;
        } else if (eventData.type == 'EndLocation') {
            this.arrivalAirport = eventData.location;
        } else {

        }
    }

    handleFlightAirportCancel(event) {
        let eventData = event.detail;
        if (eventData.type == 'StartLocation') {
            this.departureAirport = '';
        } else if (eventData.type == 'EndLocation') {
            this.arrivalAirport = '';
        } else {

        }
    }

    handleFlightTimeSelected(event) {
        let eventData = event.detail;
        if (eventData.type == 'ArrivalTime') {
            this.arrivalTime = eventData.time;
        } else if (eventData.type == 'DepartureTime') {
            this.departureTime = eventData.time;
        } else {

        }
    }
    handleFlightTimeCancel(event) {
        let eventData = event.detail;
        if (eventData.type == 'ArrivalTime') {
            this.arrivalTime = ''
        } else if (eventData.type == 'DepartureTime') {
            this.departureTime = ''
        } else {

        }
    }

    handleChangePNR(event) {
        this.pnr = event.target.value;
    }

    handleChangeTicketClass(event) {
        this.ticketClass = event.target.value;
    }

    handleChangeLuggageAllowance(event) {
        this.luggageAllowance = event.target.value;
    }
    sendEmail() {
        if (this.selectedServiceType) {
            this.openEmailModal = true;
        }
    }
    handleCloseModal() {
        this.openEmailModal = false;
    }

    toggleShowCardDetail(event) {
        this.showCardDetail = !this.showCardDetail;
    }

    acceptRateCostMarkups() {
        this.isLoading = true;
        this.rateStatus = "Accepted";
        UpdateQuoteLineItemWithRateStatus({ quoteLineItemId: this.quoteLineItemId, rateStatus: this.rateStatus })
            .then(result => {
                if (result.length == 0) {
                    this.isLoading = false;
                } else {
                    this.showToast('Error', result[0]);
                    this.isLoading = false;
                }
            })
            .catch(error => {
            })
    }

    rejectRateCostMarkups() {
        this.isLoading = true;
        this.rateStatus = "Rejected";
        UpdateQuoteLineItemWithRateStatus({ quoteLineItemId: this.quoteLineItemId, rateStatus: this.rateStatus })
            .then(result => {
                if (result.length == 0) {
                    GetCostMarkups({ QuoteLineItemId: this.quoteLineItemId })
                        .then(result => {
                            this.costMarkup = result;
                            this.isLoading = false;

                        })
                        .catch(error => {
                            this.isLoading = false;
                        })
                } else {
                    this.showToast('Error', result[0]);
                    this.isLoading = false;
                }
            })
            .catch(error => {
            })
    }


    deleteService(event) {
        if (this.quoteLineItemId == 'newitem') {
            const deleteCard = new CustomEvent("deletecard", {})
            this.dispatchEvent(deleteCard);
        } else {
            //Delete QuoteLineItem
            this.isLoading = true;
            DeleteExistingQuoteLineItems({ quoteLineItemId: this.quoteLineItemId })
                .then(result => {
                    if (result.length == 0) {
                        const refreshEvent = new CustomEvent("refresh", {})
                        this.dispatchEvent(refreshEvent);
                        this.isLoading = false;
                    } else {
                        this.showToast('Error', result[0]);
                        this.isLoading = false;
                    }
                })
                .catch(error => {
                })
        }
    }

    refreshCard(event) {
        this.isLoading = true;
        this.prePopulateCard();

    }
}