public class AccountDataPopulateBatch implements Database.Batchable<sObject> {
    public Database.QueryLocator start(Database.BatchableContext BC) {
        return Database.getQueryLocator([
            SELECT Id, Name, CRM_Code__c, Service_Type__c, TP_Location__c, 
                   TP_Location_Code__c, Location__c, Reservations_Phone__c, Reservations_Email__c
            FROM Account 
            WHERE RecordType.Name = 'Supplier' AND CRM_Code__c != null
        ]);
    }

    public void execute(Database.BatchableContext BC, List<Account> accounts) {
        // Step 1: Get CRM codes for current batch only
        Set<String> crmCodes = new Set<String>();
        for (Account acc : accounts) {
            if (acc.CRM_Code__c != null) {
                crmCodes.add(acc.CRM_Code__c);
            }
        }

        // Step 2: Get only relevant OPT__c records for this batch
        Map<String, List<OPT__c>> crmToOptsMap = new Map<String, List<OPT__c>>();
        if (!crmCodes.isEmpty()) {
            for (OPT__c opt : [
                SELECT CRM_Code__c, SRV_Name__c, LOC_Name__c, Location__c 
                FROM OPT__c 
                WHERE CRM_Code__c IN :crmCodes
            ]) {
                if (opt.CRM_Code__c == null) continue;

                if (!crmToOptsMap.containsKey(opt.CRM_Code__c)) {
                    crmToOptsMap.put(opt.CRM_Code__c, new List<OPT__c>());
                }
                crmToOptsMap.get(opt.CRM_Code__c).add(opt);
            }
        }

        // Step 3: Get Location__c mapping (can be static since they’re usually small)
        Map<String, Id> locNameToIdMap = new Map<String, Id>();
        for (Location__c loc : [
            SELECT LOC_Name__c, Location__c 
            FROM Location__c 
            WHERE Is_Parent__c = false
        ]) {
            if (loc.LOC_Name__c != null && loc.Location__c != null) {
                locNameToIdMap.put(loc.LOC_Name__c, loc.Location__c);
            }
        }
        
        Map<String, Id> crmToNTS = new Map<String, Id>();
        
        for (NTS__c nts : [SELECT Id, CATEGORY__c, CRM_Lookup__r.CODE__c FROM NTS__c WHERE CATEGORY__c = 'SSP']) {
            if (nts.CRM_Lookup__r.CODE__c != null) {
                crmToNTS.put(nts.CRM_Lookup__r.CODE__c, nts.Id);
            }
        }
        
        // get reservation email and phone
        Map<String, PBK__c> crmToPBK = new Map<String, PBK__c>();
        
        for (PBK__c pbk : [SELECT Id, AGENT_SUPPLIER__c, PHONE__c, EMAIL__c FROM PBK__c WHERE CONTACTTYPE__c = 'RE' AND CONTACTNAME__c = 'Reservations' AND AGENT_SUPPLIER__c IN :crmCodes]) {
            crmToPBK.put(pbk.AGENT_SUPPLIER__c, pbk);
        }
        

        // Step 4: Populate and update accounts
        List<Account> toUpdate = new List<Account>();

        for (Account acc : accounts) {
            List<OPT__c> matchingOpts = crmToOptsMap.get(acc.CRM_Code__c);

            if (matchingOpts != null && !matchingOpts.isEmpty()) {
                Set<String> srvSet = new Set<String>();
                for (OPT__c opt : matchingOpts) {
                    if (opt.SRV_Name__c != null) srvSet.add(opt.SRV_Name__c);
                }
                acc.Service_Type__c = String.join(new List<String>(srvSet), ';');

                OPT__c firstOpt = matchingOpts[0];
                acc.TP_Location__c = firstOpt.LOC_Name__c;
                acc.TP_Location_Code__c = firstOpt.Location__c;
            }

            Id locId = locNameToIdMap.get(acc.TP_Location_Code__c);
            if (locId != null) {
                acc.Location__c = locId;
            }
            
            Id ntsId = crmToNTS.get(acc.CRM_Code__c);
            if (ntsId != null) {
                acc.Supplier_Specials__c = ntsId;
            }
            
            PBK__c pbkRecord = crmToPBK.get(acc.CRM_Code__c);
            if (pbkRecord != null) {
                String email = pbkRecord.EMAIL__c != null ? pbkRecord.EMAIL__c : '';
                String phone = pbkRecord.PHONE__c != null ? pbkRecord.PHONE__c : '';
                
                acc.Reservations_Email__c = email;
                acc.Reservations_Phone__c = phone;
            }

            toUpdate.add(acc);
        }

        if (!toUpdate.isEmpty()) {
            update toUpdate;
        }
    }

    public void finish(Database.BatchableContext BC) {
        System.debug('Batch completed successfully');
    }
}