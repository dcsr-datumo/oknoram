import { HttpClient } from '@angular/common/http';
import { Inject, Injectable } from '@angular/core';
import {
  ConvertJSONLD,
  KnoraConstants,
  ReadBooleanValue,
  ReadDecimalValue,
  ReadIntegerValue,
  ReadLinkValue,
  ReadPropertyItem,
  ReadResource,
  ReadTextValueAsString
} from '@knora/core';
import { from, Observable } from 'rxjs';
import { map, switchMap } from 'rxjs/operators';
import { ResourceMapping } from '../../mapping/resource-mapping';
import { OknoramConfig, OknoramConfigToken } from '../../oknoram-config';
import { KnoraApiService } from '../knora-api.service';
import { KnoraResource } from '../knora-resource';

declare let require: any;
const jsonld = require('jsonld');

@Injectable({
  providedIn: 'root'
})
export class KnoraApiDefaultService implements KnoraApiService {
  constructor(
    @Inject(OknoramConfigToken) private config: OknoramConfig,
    private http: HttpClient
  ) {}

  countQuery(query: string): Observable<number> {
    return this.searchExtendedRequest(query, null, true).pipe(
      map(this.json2Count)
    );
  }

  executeQuery(
    query: string,
    rm: ResourceMapping,
    pageIndex = null
  ): Observable<KnoraResource[]> {
    return this.searchExtendedRequest(query, pageIndex).pipe(
      switchMap(this.json2ReadResources),
      map((resources: ReadResource[]) =>
        resources.map(r => this.readResource2KnoraResource(r, rm))
      )
    );
  }

  private json2Count(json: string): number {
    return +json['schema:numberOfItems'];
  }

  private json2ReadResources(json: string): Observable<ReadResource[]> {
    return from(
      jsonld.promises
        .compact(json, {})
        .then(
          compacted =>
            ConvertJSONLD.createReadResourcesSequenceFromJsonLD(compacted)
              .resources
        )
    );
  }

  private convertValue(item: ReadPropertyItem): any {
    if (item.getClassName() === KnoraConstants.ReadTextValueAsString) {
      return (<ReadTextValueAsString>item).str;
    }
    if (item.getClassName() === KnoraConstants.ReadBooleanValue) {
      return (<ReadBooleanValue>item).bool;
    }
    if (item.getClassName() === KnoraConstants.ReadIntegerValue) {
      return (<ReadIntegerValue>item).integer;
    }
    if (item.getClassName() === KnoraConstants.ReadDecimalValue) {
      return (<ReadDecimalValue>item).decimal;
    }
    if (item.getClassName() === KnoraConstants.ReadLinkValue) {
      return (<ReadLinkValue>item).id;
    }

    throw new Error(`Not managed type ${item.getClassName()}`);
  }

  private readResource2KnoraResource(
    r: ReadResource,
    rm: ResourceMapping
  ): KnoraResource {
    const properties = new Map<string, any>();
    if (r.properties) {
      Object.keys(r.properties).forEach(propName => {
        properties.set(
          this.uncompactPropName(propName, rm),
          // FIXME: how to choose the correct ReadPropertyItem ?
          this.convertValue(r.properties[propName][0])
        );
      });
    }
    return {
      id: r.id,
      label: r.label,
      properties
    } as KnoraResource;
  }

  private uncompactPropName(propName: string, rm: ResourceMapping): string {
    const prefixOnto = `${this.config.knoraApiBaseUrl}/ontology/${
      rm.def.projectCode
    }/${rm.def.projectShortname}/v2#`;
    if (!propName.startsWith(prefixOnto)) {
      throw new Error(
        `Cannot find ontology prefix ${prefixOnto} in Knora resource property name: ${propName}`
      );
    }
    return propName.substr(prefixOnto.length);
  }

  private searchExtendedRequest(
    query: string,
    pageIndex?: number,
    count = false
  ) {
    return this.http.post(
      this.config.knoraApiBaseUrl +
        '/v2/searchextended' +
        (count ? '/count' : ''),
      query + (pageIndex ? ' OFFSET ' + pageIndex : '')
    );
  }
}
