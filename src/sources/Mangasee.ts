import { Source } from './Source'
import { Manga } from '../models/Manga/Manga'
import { Chapter } from '../models/Chapter/Chapter'
import { MangaTile } from '../models/MangaTile/MangaTile'
import { SearchRequest } from '../models/SearchRequest/SearchRequest'
import { Request } from '../models/RequestObject/RequestObject'
import { ChapterDetails } from '../models/ChapterDetails/ChapterDetails'
import { Tag, TagSection } from '../models/TagSection/TagSection'
import { HomeSection, HomeSectionRequest } from '../models/HomeSection/HomeSection'

const MS_DOMAIN = 'https://mangaseeonline.us'

export class Mangasee extends Source {
  constructor(cheerio: CheerioAPI) {
    super(cheerio)
  }

  getVersion(): string { return '1.0' }

  getMangaDetailsRequest(ids: string[]): Request[] {
    let requests: Request[] = []
    for (let id of ids) {
      let metadata = { 'id': id }
      requests.push(createRequestObject({
        url: `${MS_DOMAIN}/manga/`,
        metadata: metadata,
        method: 'GET',
        param: id
      }))
    }
    return requests
  }

  getMangaDetails(data: any[], metadata: any[]): Manga[] {
    let manga: Manga[] = []
    for (let [i, response] of data.entries()) {
      let $ = this.cheerio.load(response)
      let info = $('.row')
      let image = $('img', '.row').attr('src') ?? ''
      let title = $('.SeriesName', info).text() ?? ''
      let titles = [title]
      let details = $('.details', info)
      let author = ''

      let tagSections: TagSection[] = [createTagSection({ id: '0', label: 'genres', tags: [] }),
      createTagSection({ id: '1', label: 'format', tags: [] })]

      let status = 1
      let summary = ''
      let hentai = false

      for (let row of $('.row', details).toArray()) {
        let text = $('b', row).text()
        switch (text) {
          case 'Alternate Name(s): ': {
            titles.push($(row).text().replace(/(Alternate Name\(s\):)*(\t*\n*)/g, '').trim())
            break
          }
          case 'Author(s): ': {
            author = $(row).text().replace(/(Author\(s\):)*(\t*\n*)/g, '').trim()
            break
          }
          case 'Genre(s): ': {
            let items = $(row).text().replace(/(Genre\(s\):)*(\t*\n*)/g, '').split(',')
            for (let item of items) {
              if (item.toLowerCase().includes('hentai')) {
                hentai = true
              }
              else {
                tagSections[0].tags.push(createTag({ id: item.trim(), label: item.trim() }))
              }
            }
            break
          }
          case 'Type:': {
            let type = $(row).text().replace(/(Type:)*(\t*\n*)/g, '').trim()
            tagSections[1].tags.push(createTag({ id: type.trim(), label: type.trim() }))
            break
          }
          case 'Status: ': {
            status = $(row).text().includes('Ongoing') ? 1 : 0
            break
          }
        }

        summary = $('.description', row).text()
      }

      manga.push(createManga({
        id: metadata[i].id,
        titles: titles,
        image: image,
        rating: 0,
        status: status,
        author: author,
        tags: tagSections,
        description: summary,
        hentai: hentai
      }))
    }
    return manga
  }

  getChaptersRequest(mangaId: string): Request {
    let metadata = { 'id': mangaId }
    return createRequestObject({
      url: `${MS_DOMAIN}/manga/`,
      method: "GET",
      metadata: metadata,
      headers: {
        "content-type": "application/x-www-form-urlencoded"
      },
      param: mangaId
    })
  }

  getChapters(data: any, metadata: any): Chapter[] {
    let $ = this.cheerio.load(data)
    let chapters: Chapter[] = []
    for (let item of $('.list-group-item', '.list.chapter-list').toArray()) {
      let id = ($(item).attr('href')?.split('/').pop() ?? '').replace('.html', '')
      let chNum = Number($(item).attr('chapter') ?? 0)
      let title = $('.chapterLabel', item).text() ?? ''

      let time = new Date($('time', item).attr('datetime') ?? '')
      chapters.push(createChapter({
        id: id,
        mangaId: metadata.id,
        name: title,
        chapNum: chNum,
        time: time,
        langCode: "en",
      }))
    }
    return chapters
  }

  getChapterDetailsRequest(mangaId: string, chapId: string): Request {
    let metadata = { 'mangaId': mangaId, 'chapterId': chapId, 'nextPage': false, 'page': 1 }
    return createRequestObject({
      url: `${MS_DOMAIN}/read-online/`,
      metadata: metadata,
      headers: {
        "content-type": "application/x-www-form-urlencoded"
      },
      method: 'GET',
      param: chapId
    })
  }

  getChapterDetails(data: any, metadata: any): { 'details': ChapterDetails, 'nextPage': boolean, 'param': string | null } {
    let script = JSON.parse((/PageArr=(.*);/g.exec(data) ?? [])[1])
    let pages: string[] = []
    let images: string[] = Object.values(script)
    for (let [i, image] of images.entries()) {
      if (i != images.length - 1) {
        pages.push(image)
      }
    }

    let chapterDetails = createChapterDetails({
      id: metadata.chapterId,
      mangaId: metadata.mangaId,
      pages, longStrip: false
    })

    let returnObject = {
      'details': chapterDetails,
      'nextPage': metadata.nextPage,
      'param': null
    }

    return returnObject
  }


  filterUpdatedMangaRequest(ids: any, time: Date, page: number): Request {
    let metadata = { 'ids': ids, 'referenceTime': time }
    let data: any = { 'page': page }
    data = Object.keys(data).map(function (key: any) { return encodeURIComponent(key) + '=' + encodeURIComponent(data[key]) }).join('&')
    return createRequestObject({
      url: `${MS_DOMAIN}/home/latest.request.php`,
      metadata: metadata,
      headers: {
        "content-type": "application/x-www-form-urlencoded"
      },
      timeout: 4000,
      method: "POST",
      data: data
    })
  }

  filterUpdatedManga(data: any, metadata: any): { 'updatedMangaIds': string[], 'nextPage': boolean } {
    let $ = this.cheerio.load(data)
    let returnObject: { 'updatedMangaIds': string[], 'nextPage': boolean } = {
      'updatedMangaIds': [],
      'nextPage': true
    }

    for (let item of $('a').toArray()) {
      if (new Date($('time', item).attr('datetime') ?? '') > metadata.referenceTime) {
        let id = ($(item).attr('href')?.split('/').pop()?.match(/(.*)-chapter/) ?? [])[1] ?? ''
        if (metadata.ids.includes(id)) {
          returnObject.updatedMangaIds.push(id)
        }
      }
      else {
        returnObject.nextPage = false
        return returnObject
      }
    }

    return returnObject
  }

  searchRequest(query: SearchRequest, page: number): Request | null {
    let genres = (query.includeGenre ?? []).concat(query.includeDemographic ?? []).join(',')
    let excluded = (query.excludeGenre ?? ['Any']).concat(query.excludeDemographic ?? []).join(',')
    let iFormat = (query.includeFormat ?? []).join(',')
    let status = ""
    switch (query.status) {
      case 0: status = 'Completed'; break
      case 1: status = 'Ongoing'; break
      default: status = ''
    }

    let data: any = {
      'page': page,
      'keyword': query.title,
      'author': query.author || query.artist || '',
      'sortBy': 'popularity',
      'sortOrder': 'descending',
      'status': status,
      'type': iFormat,
      'genre': genres,
      'genreNo': excluded
    }
    let metadata = data
    data = Object.keys(data).map(function (key: any) {
      if (data[key] != '')
        return encodeURIComponent(key) + '=' + encodeURIComponent(data[key])
    }).join('&').replace(/&&/g, '&')

    return createRequestObject({
      url: `${MS_DOMAIN}/search/request.php`,
      metadata: metadata,
      headers: {
        "content-type": "application/x-www-form-urlencoded"
      },
      timeout: 4000,
      method: "POST",
      data: data
    })
  }

  search(data: any): MangaTile[] {
    let $ = this.cheerio.load(data)

    let mangaTiles: MangaTile[] = []
    for (let item of $('.requested').toArray()) {
      let img = $('img', item).attr('src') ?? ''
      let id = $('.resultLink', item).attr('href')?.split('/').pop() ?? ''
      let title = $('.resultLink', item).text()
      let author = $('p', item).first().find('a').text()
      mangaTiles.push({
        id: id,
        title: createIconText({
          text: title
        }),
        image: img,
        subtitleText: createIconText({
          text: author
        })
      })
    }

    return mangaTiles
  }

  getTagsRequest(): Request | null {
    return createRequestObject({
      url: `${MS_DOMAIN}/search/`,
      method: 'GET',
      headers: {
        "content-type": "application/x-www-form-urlencoded",
      }
    })
  }

  getTags(data: any): TagSection[] | null {
    let tagSections: TagSection[] = [createTagSection({ id: '0', label: 'genres', tags: [] }),
    createTagSection({ id: '1', label: 'format', tags: [] })]

    let $ = this.cheerio.load(data)
    let types = $('#typeCollapse')
    for (let type of $('.list-group-item', types).toArray()) {
      let value = $(type).attr('value') ?? ''
      if (value != '') {
        tagSections[1].tags.push(createTag({ id: value, label: $(type).text() }))
      }
    }

    let genres = $('#genreCollapse')
    for (let genre of $('.list-group-item', genres).toArray()) {
      tagSections[0].tags.push(createTag({ id: $(genre).attr('value') ?? '', label: $(genre).text() }))
    }

    return tagSections
  }

  getHomePageSectionRequest(): HomeSectionRequest[] | null { return null }
  getHomePageSections(data: any, section: HomeSection[]): HomeSection[] | null { return null }
  getViewMoreRequest(key: string, page: number): Request | null { return null }
  getViewMoreItems(data: any, key: string): MangaTile[] | null { return null }
}
