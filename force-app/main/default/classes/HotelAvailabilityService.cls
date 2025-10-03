public with sharing class HotelAvailabilityService {
    public class Request {
        @InvocableVariable(required=true)
        public List<String> hotelNames;

        @InvocableVariable(required=true)
        public Date startDate;

        @InvocableVariable(required=true)
        public Date endDate;

        @InvocableVariable(required=true)
        public Integer numberOfPersons;

        @InvocableVariable(required=true)
        public Integer numberOfChildren;

        @InvocableVariable(required=true)
        public Id quoteId;
    }

    public class Response {
        @InvocableVariable
        public String availabilityMessage;
    }

    public class HotelAvailabilityResult {
        public String hotelName;
        public String availability;
        public Decimal totalPrice;
        public String currencyName;
        public String rateText;
        public String OptId;
    }

    public class HotelWrapper {
        public String hotelName;
        public Date startDate;
        public Date endDate;
        public Integer numberOfPersons;
        public Integer numberOfChildren;
        public String availability;
        public Id accountId;
        public String crmCode;
        public Id quoteId;
        public List<HotelAvailabilityResult> availabilityResults;
    }

    public class HotelRequestWrapper{
        public List<Record> records;
    }

    public class Record {
        public String Opt;
        public Date DateFrom;
        public Date DateTo;
        public String Info;
        public String ButtonName;
        public Integer MaximumOptions;
        public List<RoomConfigWrapper> RoomConfigs;
    }

    public class RoomConfigWrapper {
        public RoomConfig RoomConfig;
    }

    public class RoomConfig {
        public Integer Adults;
        public Integer Children;
    }

    @InvocableMethod(label='Check Hotels Availability & Fire Single Event')
    public static List<Response> checkHotelAvailability(List<Request> requests) {

        List<Response> results = new List<Response>();

        List<Tourplan_Synatic_Configuration__mdt> config = [SELECT Id, DeveloperName, Url_Endpoint__c, Api_Key__c FROM Tourplan_Synatic_Configuration__mdt WHERE DeveloperName = 'Synatic_Tourplan_API'];
        if (config.isEmpty()) {
            return results;
        }
        String endpoint = config[0].Url_Endpoint__c;
        String apiKey = config[0].Api_Key__c;

        for (Request req : requests) {
            Map<String, Account> crmCodeToAccountMap = new Map<String, Account>();
            Set<String> crmCodeSet = new Set<String>();
            Map<String, String> OptCodeToCrmCode = new Map<String, String>();
            Map<String, HotelWrapper> hotelNameToHotelWrapperMap = new Map<String, HotelWrapper>();
            List<HotelWrapper> hotelList = new List<HotelWrapper>();
            HotelRequestWrapper requestWrapper = new HotelRequestWrapper();
            Map<String, HotelWrapper> hotelData = new Map<String, HotelWrapper>();
            requestWrapper.records = new List<Record>();

            Account acc = [SELECT Id, Name, CRM_Code__c, TP_Location_Code__c FROM Account WHERE RecordType.Name = 'Supplier' and Name =:req.hotelNames[0] LIMIT 1];

            if (acc != null && acc.CRM_Code__c != null && acc.TP_Location_Code__c != null) {
                Record rec = new Record();
                String optCode = String.join(new List<String>{acc.TP_Location_Code__c,'AC',acc.CRM_Code__c,'??????'}, '');
                rec.Opt = optCode;
                rec.DateFrom = req.startDate;
                rec.DateTo = req.endDate.addDays(-1);
                rec.ButtonName = 'Accommodation';
                rec.MaximumOptions = 30;
                rec.Info = 'GSI';

                if (req.startDate == req.endDate) {
                    rec.DateTo = req.endDate.addDays(1);
                }

                /*rec.RoomConfigs = new List<RoomConfigWrapper>();
                RoomConfigWrapper rcw = new RoomConfigWrapper();
                rcw.RoomConfig = new RoomConfig();
                rcw.RoomConfig.Adults = req.numberOfPersons != null ? req.numberOfPersons : 2;
                rcw.RoomConfig.Children = req.numberOfChildren != null ? req.numberOfChildren : 0;
                rec.RoomConfigs.add(rcw);
                requestWrapper.records.add(rec);*/

                Integer totalAdults = req.numberOfPersons != null ? req.numberOfPersons : 2;
                Integer totalChildren = req.numberOfChildren != null ? req.numberOfChildren : 0;

                Integer maxAdultsPerRoom = 2;
                Integer maxChildrenPerRoom = 2;

                List<RoomConfigWrapper> roomConfigs = new List<RoomConfigWrapper>();

                // Allocate Adults
                while (totalAdults > 0 || totalChildren > 0) {
                    RoomConfigWrapper rcw = new RoomConfigWrapper();
                    rcw.RoomConfig = new RoomConfig();

                    Integer assignAdults = Math.min(maxAdultsPerRoom, totalAdults);
                    Integer assignChildren = Math.min(maxChildrenPerRoom, totalChildren);

                    rcw.RoomConfig.Adults = assignAdults;
                    rcw.RoomConfig.Children = assignChildren;

                    roomConfigs.add(rcw);

                    totalAdults -= assignAdults;
                    totalChildren -= assignChildren;
                }

                // assign back to record
                rec.RoomConfigs = roomConfigs;
                requestWrapper.records.add(rec);
            }

            String availabilityMsg = 'Results:';

            Http http = new Http();
            HttpRequest httpRequest = new HttpRequest();
            httpRequest.setEndpoint(endpoint);
            httpRequest.setMethod('POST');
            httpRequest.setHeader('Content-Type', 'application/json');
            httpRequest.setHeader('X-API-Key', apiKey);
            httpRequest.setBody(JSON.serialize(requestWrapper));
            httpRequest.setTimeout(120000); // Set timeout to 120 seconds

            HttpResponse res = http.send(httpRequest);

            if (res.getBody() != null) {
                String hotelJson = JSON.serialize(res.getBody());
                String reqJson = JSON.serialize(requestWrapper);

                Hotel_Availability_Event__e evt = new Hotel_Availability_Event__e(
                    Hotel_JSON__c = res.getBody(),
                    Start_Date__c = req.startDate,
                    End_Date__c = req.endDate,
                    Request_JSON__c = reqJson,
                    Quote_Id__c = req.quoteId
                );
                EventBus.publish(evt);
            }

            Response resp = new Response();
            resp.availabilityMessage = availabilityMsg + ' Request: ' + JSON.serialize(requestWrapper) + ' Response : ' + res.getBody();
            results.add(resp);
        }
        return results;
    }
}
